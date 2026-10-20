<?php

declare(strict_types=1);

namespace Mra\Service;

use Mra\Log\AuditLogger;
use Mra\Log\SecurityLogger;
use Mra\Model\Session;
use Mra\Model\User;
use Mra\Repository\DuplicateEmailException;
use Mra\Repository\UserRepository;

/**
 * Sign in and sign up with Google are one flow: the first time a Google identity is seen, an account
 * is created (already verified: Google has verified the address); afterwards it signs in.
 *
 * Account takeover is the risk here, so the rules are explicit:
 *  - the account is matched on Google's stable `sub` first, never on email alone once linked;
 *  - an existing account with the same VERIFIED email is linked (Google proves the same person
 *    controls that address);
 *  - an existing UNVERIFIED account with that email is taken over cleanly: its password is replaced by
 *    an unusable one, because whoever registered it never proved they own the address and could
 *    otherwise keep signing in with the password they chose.
 */
final class GoogleAuthService
{
    private const FAILURE_LIMIT = 20;
    private const WINDOW = 3600;

    public function __construct(
        private readonly ?GoogleIdTokenVerifier $verifier,
        private readonly UserRepository $users,
        private readonly SessionService $sessions,
        private readonly ThrottleService $throttle,
        private readonly AuditLogger $audit,
        private readonly SecurityLogger $security
    ) {
    }

    public function enabled(): bool
    {
        return $this->verifier !== null;
    }

    /**
     * @return array{status:'ok',user:User,token:string,session:Session,created:bool}
     *     |array{status:'invalid'}|array{status:'throttled',retry_after:int}|array{status:'not_configured'}
     */
    public function signIn(string $credential, Session $current, string $ip, ?string $userAgent): array
    {
        if ($this->verifier === null) {
            return ['status' => 'not_configured'];
        }
        if ($this->throttle->isLimited('google_ip', $ip, self::FAILURE_LIMIT, self::WINDOW)) {
            $this->security->record('auth.throttled', 'warning', null, ['method' => 'google'], $ip);
            return ['status' => 'throttled', 'retry_after' => $this->throttle->retryAfter('google_ip', $ip, self::WINDOW)];
        }
        try {
            $claims = $this->verifier->verify($credential);
        } catch (GoogleTokenException $e) {
            $this->throttle->record('google_ip', $ip);
            $this->security->record('auth.google_failed', 'warning', null, ['reason' => $e->getMessage()], $ip);
            return ['status' => 'invalid'];
        }

        [$user, $created] = $this->resolve($claims['sub'], $claims['email'], $claims['name']);
        $new = $this->sessions->regenerate($current, $user->id);
        $this->audit->record(
            'user.login',
            'success',
            $user->id,
            'user',
            (string) $user->id,
            ['method' => 'google', 'created' => $created],
            $ip,
            $userAgent
        );
        return ['status' => 'ok', 'user' => $user, 'token' => $new['token'], 'session' => $new['session'], 'created' => $created];
    }

    /** @return array{0:User,1:bool} the account and whether it was just created */
    private function resolve(string $sub, string $email, string $name): array
    {
        $bySub = $this->users->findByGoogleSub($sub);
        if ($bySub !== null) {
            return [$bySub, false];
        }
        $byEmail = $this->users->findByEmail($email);
        if ($byEmail !== null) {
            if (!$byEmail->isVerified()) {
                $this->users->updatePasswordHash($byEmail->id, self::unusablePasswordHash());
                $this->users->markVerified($byEmail->id);
                $this->security->record('auth.unverified_account_claimed_by_google', 'warning', $byEmail->id, []);
            }
            $this->users->linkGoogleSub($byEmail->id, $sub);
            return [$this->users->findById($byEmail->id) ?? $byEmail, false];
        }
        try {
            $id = $this->users->create($email, $name, self::unusablePasswordHash());
        } catch (DuplicateEmailException) {
            // Another request created it a moment ago; use that account.
            $existing = $this->users->findByEmail($email);
            if ($existing === null) {
                throw new \RuntimeException('Account vanished during sign-in.');
            }
            $this->users->linkGoogleSub($existing->id, $sub);
            return [$existing, false];
        }
        $this->users->markVerified($id);
        $this->users->linkGoogleSub($id, $sub);
        $this->audit->record('user.registered', 'success', $id, 'user', (string) $id, ['method' => 'google']);
        return [$this->users->findById($id) ?? throw new \RuntimeException('Account missing after creation.'), true];
    }

    /** A hash of 32 random bytes nobody holds: the account has no password until one is set by reset. */
    private static function unusablePasswordHash(): string
    {
        return password_hash(bin2hex(random_bytes(32)), PASSWORD_ARGON2ID);
    }
}
