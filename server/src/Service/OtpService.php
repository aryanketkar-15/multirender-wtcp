<?php

declare(strict_types=1);

namespace Mra\Service;

use DateTimeImmutable;
use Mra\Log\AuditLogger;
use Mra\Log\SecurityLogger;
use Mra\Mail\MailerInterface;
use Mra\Repository\OtpRepository;
use Mra\Repository\UserRepository;
use Mra\Support\Clock;

/**
 * Six-digit email OTP. Codes are generated with random_int(), hashed before storage (a database
 * read must not yield working codes), expire after 10 minutes, allow 5 attempts, and at most 3
 * requests per email per hour. Every failure looks identical to the caller.
 */
final class OtpService
{
    public const TTL_SECONDS = 600;
    public const MAX_ATTEMPTS = 5;
    public const REQUEST_LIMIT = 3;
    public const REQUEST_WINDOW = 3600;

    /** A valid bcrypt hash of a random value, used to equalise work on the "no such code" paths. */
    private readonly string $decoyHash;

    public function __construct(
        private readonly UserRepository $users,
        private readonly OtpRepository $otps,
        private readonly ThrottleService $throttle,
        private readonly MailerInterface $mailer,
        private readonly AuditLogger $audit,
        private readonly SecurityLogger $security,
        private readonly Clock $clock
    ) {
        $this->decoyHash = password_hash(bin2hex(random_bytes(8)), PASSWORD_BCRYPT);
    }

    /**
     * Always behaves the same for registered, unregistered and already-verified addresses,
     * except that only a registered unverified account actually receives mail.
     *
     * @throws RateLimitedException
     */
    public function request(string $email, string $ip): void
    {
        $key = mb_strtolower(trim($email));
        if ($this->throttle->isLimited('otp_request', $key, self::REQUEST_LIMIT, self::REQUEST_WINDOW)) {
            $this->security->record('otp.request_rate_limited', 'warning', null, [], $ip);
            throw new RateLimitedException($this->throttle->retryAfter('otp_request', $key, self::REQUEST_WINDOW));
        }
        $this->throttle->record('otp_request', $key);

        $code = (string) random_int(100000, 999999);
        $hash = password_hash($code, PASSWORD_BCRYPT); // same cost on every path
        $user = $this->users->findByEmail($email);
        if ($user === null || $user->isVerified()) {
            return;
        }

        $now = $this->clock->now();
        $this->otps->replaceForUser($user->id, $hash, $now->modify('+' . self::TTL_SECONDS . ' seconds'), $now);
        $this->mailer->send(
            $user->email,
            'Your MRA verification code',
            "Your verification code is {$code}.\nIt expires in 10 minutes. If you did not ask for it, ignore this message."
        );
        $this->audit->record('otp.issued', 'success', $user->id, 'user', (string) $user->id, [], $ip);
    }

    /** Returns true on success. Wrong, expired, locked and unknown-user cases are indistinguishable. */
    public function verify(string $email, string $code, string $ip): bool
    {
        $user = $this->users->findByEmail($email);
        $row = $user !== null ? $this->otps->findForUser($user->id) : null;

        $now = $this->clock->now();
        $live = $row !== null
            && $row['attempts'] < self::MAX_ATTEMPTS
            && new DateTimeImmutable($row['expires_at'], new \DateTimeZone('UTC')) > $now;

        // Always run one password_verify so response time does not reveal which case applied.
        $matches = password_verify($code, $live && $row !== null ? $row['code_hash'] : $this->decoyHash);

        if ($user === null || $row === null) {
            return false;
        }
        if ($live && $matches) {
            $this->users->markVerified($user->id);
            $this->otps->deleteForUser($user->id);
            $this->audit->record('user.verify_email', 'success', $user->id, 'user', (string) $user->id, [], $ip);
            return true;
        }
        if ($row['attempts'] < self::MAX_ATTEMPTS) {
            $attempts = $this->otps->incrementAttempts($row['id']);
            if ($attempts >= self::MAX_ATTEMPTS) {
                $this->security->record('otp.attempts_exhausted', 'warning', $user->id, [], $ip);
            }
        }
        $this->audit->record('user.verify_email', 'failure', $user->id, 'user', (string) $user->id, [], $ip);
        return false;
    }
}
