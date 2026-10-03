<?php

declare(strict_types=1);

namespace Mra\Service;

use Mra\Log\AuditLogger;
use Mra\Log\SecurityLogger;
use Mra\Mail\MailerInterface;
use Mra\Repository\PasswordResetRepository;
use Mra\Repository\UserRepository;
use Mra\Support\Clock;
use Mra\Validation\Schemas;
use Mra\Validation\Validator;

/**
 * Single-use reset. The token is 32 CSPRNG bytes, stored only as a SHA-256 hash, valid for 15
 * minutes. Completing a reset kills every active session of the user: the usual reason to reset
 * is suspected compromise, and an attacker's live session must not survive it.
 */
final class PasswordResetService
{
    public const TTL_SECONDS = 900;
    public const REQUEST_LIMIT = 3;
    public const REQUEST_WINDOW = 3600;

    public function __construct(
        private readonly UserRepository $users,
        private readonly PasswordResetRepository $resets,
        private readonly SessionService $sessions,
        private readonly ThrottleService $throttle,
        private readonly MailerInterface $mailer,
        private readonly AuditLogger $audit,
        private readonly SecurityLogger $security,
        private readonly Clock $clock,
        private readonly string $appUrl
    ) {
    }

    /**
     * Behaves identically for known and unknown addresses.
     *
     * @throws RateLimitedException
     */
    public function request(string $email, string $ip): void
    {
        $key = mb_strtolower(trim($email));
        if ($this->throttle->isLimited('reset_request', $key, self::REQUEST_LIMIT, self::REQUEST_WINDOW)) {
            $this->security->record('password_reset.request_rate_limited', 'warning', null, [], $ip);
            throw new RateLimitedException($this->throttle->retryAfter('reset_request', $key, self::REQUEST_WINDOW));
        }
        $this->throttle->record('reset_request', $key);

        $token = bin2hex(random_bytes(32));
        $hash = hash('sha256', $token);
        $user = $this->users->findByEmail($email);
        if ($user === null) {
            return;
        }
        $now = $this->clock->now();
        $this->resets->issue($user->id, $hash, $now->modify('+' . self::TTL_SECONDS . ' seconds'), $now);
        $link = rtrim($this->appUrl, '/') . '/reset-password?token=' . $token;
        $this->mailer->send(
            $user->email,
            'Reset your MRA password',
            "Use this link to choose a new password. It works once and expires in 15 minutes.\n\n{$link}\n\n"
            . 'If you did not ask for this, ignore this message; your password has not changed.'
        );
        $this->audit->record('password_reset.requested', 'success', $user->id, 'user', (string) $user->id, [], $ip);
    }

    /**
     * @param array<string,mixed> $input token, password, password_confirm
     * @throws \Mra\Validation\ValidationException
     */
    public function reset(array $input, string $ip): bool
    {
        // Field errors come first and do not spend the token, so a typo does not burn the link.
        Validator::assert($input, Schemas::passwordReset());

        $token = $input['token'] ?? null;
        $userId = is_string($token) && preg_match('/^[a-f0-9]{64}$/', $token) === 1
            ? $this->resets->consume(hash('sha256', $token), $this->clock->now())
            : null;
        if ($userId === null) {
            $this->security->record('password_reset.invalid_token', 'warning', null, [], $ip);
            return false;
        }

        $this->users->updatePasswordHash($userId, password_hash((string) $input['password'], PASSWORD_ARGON2ID));
        $killed = $this->sessions->destroyAllForUser($userId);
        $this->throttle->clear('login_account', $this->accountKey($userId));
        $this->audit->record('password_reset.completed', 'success', $userId, 'user', (string) $userId, [
            'sessions_revoked' => $killed,
        ], $ip);
        return true;
    }

    private function accountKey(int $userId): string
    {
        return mb_strtolower(trim($this->users->findById($userId)?->email ?? ''));
    }
}
