<?php

declare(strict_types=1);

namespace Mra\Service;

use Mra\Log\AuditLogger;
use Mra\Log\SecurityLogger;
use Mra\Model\Session;
use Mra\Model\User;
use Mra\Repository\UserRepository;
use Mra\Support\Clock;

/**
 * Password login with throttling on two independent dimensions. Account-only throttling lets one
 * attacker spray many accounts from one host; IP-only lets a distributed attempt through on one
 * account. Backoff after five failures doubles from 30 seconds, capped at one hour.
 */
final class AuthService
{
    public const FREE_FAILURES = 5;
    public const WINDOW = 3600;
    private const BASE_WAIT = 30;
    private const MAX_WAIT = 3600;

    private ?string $decoyHash = null;

    public function __construct(
        private readonly UserRepository $users,
        private readonly SessionService $sessions,
        private readonly ThrottleService $throttle,
        private readonly AuditLogger $audit,
        private readonly SecurityLogger $security,
        private readonly Clock $clock
    ) {
    }

    /**
     * @return array{status:'ok',user:User,token:string,session:Session}
     *     |array{status:'invalid'}|array{status:'unverified'}|array{status:'throttled',retry_after:int}
     */
    public function login(string $email, string $password, Session $current, string $ip, ?string $userAgent): array
    {
        $account = mb_strtolower(trim($email));
        $wait = max($this->remaining('login_ip', $ip), $this->remaining('login_account', $account));
        if ($wait > 0) {
            $this->security->record('auth.throttled', 'warning', null, ['retry_after' => $wait], $ip);
            return ['status' => 'throttled', 'retry_after' => $wait];
        }

        $user = $this->users->findByEmail($email);
        // One password_verify on every path, so timing does not reveal whether the account exists.
        $valid = password_verify($password, $user?->passwordHash ?? $this->decoy());

        if ($user === null || !$valid) {
            $this->throttle->record('login_ip', $ip);
            $this->throttle->record('login_account', $account);
            $this->security->record('auth.login_failed', 'warning', $user?->id, [], $ip);
            return ['status' => 'invalid'];
        }
        if (!$user->isVerified()) {
            $this->audit->record(
                'user.login',
                'denied',
                $user->id,
                'user',
                (string) $user->id,
                ['reason' => 'unverified'],
                $ip,
                $userAgent
            );
            return ['status' => 'unverified'];
        }

        $this->throttle->clear('login_account', $account);
        $new = $this->sessions->regenerate($current, $user->id);
        $this->audit->record('user.login', 'success', $user->id, 'user', (string) $user->id, [], $ip, $userAgent);
        return ['status' => 'ok', 'user' => $user, 'token' => $new['token'], 'session' => $new['session']];
    }

    public function logout(Session $session, string $ip, ?string $userAgent): void
    {
        if ($session->userId !== null) {
            $this->audit->record('user.logout', 'success', $session->userId, 'user', (string) $session->userId, [], $ip, $userAgent);
        }
        $this->sessions->destroy($session);
    }

    /** Seconds the caller must still wait, or 0. */
    private function remaining(string $bucket, string $subject): int
    {
        $failures = $this->throttle->count($bucket, $subject, self::WINDOW);
        if ($failures < self::FREE_FAILURES) {
            return 0;
        }
        $last = $this->throttle->latest($bucket, $subject, self::WINDOW);
        if ($last === null) {
            return 0;
        }
        $wait = min(self::MAX_WAIT, self::BASE_WAIT * (2 ** ($failures - self::FREE_FAILURES)));
        return max(0, $last->getTimestamp() + $wait - $this->clock->now()->getTimestamp());
    }

    private function decoy(): string
    {
        return $this->decoyHash ??= password_hash(bin2hex(random_bytes(8)), PASSWORD_ARGON2ID);
    }
}
