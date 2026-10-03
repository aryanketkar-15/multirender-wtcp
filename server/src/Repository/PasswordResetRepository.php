<?php

declare(strict_types=1);

namespace Mra\Repository;

use DateTimeImmutable;
use Mra\Support\SystemClock;

final class PasswordResetRepository extends BaseRepository
{
    /** Issuing a new token retires any earlier unused ones for the user. */
    public function issue(int $userId, string $tokenHash, DateTimeImmutable $expiresAt, DateTimeImmutable $now): void
    {
        $this->run('DELETE FROM password_reset WHERE user_id = ? AND used_at IS NULL', [$userId]);
        $this->run(
            'INSERT INTO password_reset (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)',
            [$userId, $tokenHash, SystemClock::db($expiresAt), SystemClock::db($now)]
        );
    }

    /**
     * Atomically spends a token: exactly one caller can win, even under concurrency.
     *
     * @return int|null the user id when the token was valid, unused and unexpired
     */
    public function consume(string $tokenHash, DateTimeImmutable $now): ?int
    {
        $stamp = SystemClock::db($now);
        $claimed = $this->run(
            'UPDATE password_reset SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
            [$stamp, $tokenHash, $stamp]
        )->rowCount();
        if ($claimed !== 1) {
            return null;
        }
        $userId = $this->run('SELECT user_id FROM password_reset WHERE token_hash = ?', [$tokenHash])->fetchColumn();
        return $userId === false ? null : (int) $userId;
    }
}
