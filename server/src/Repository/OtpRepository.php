<?php

declare(strict_types=1);

namespace Mra\Repository;

use DateTimeImmutable;
use Mra\Support\SystemClock;

final class OtpRepository extends BaseRepository
{
    /** Replaces any earlier code for the user: only the latest code is ever valid. */
    public function replaceForUser(int $userId, string $codeHash, DateTimeImmutable $expiresAt, DateTimeImmutable $now): void
    {
        $this->deleteForUser($userId);
        $this->run(
            'INSERT INTO user_otp (user_id, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)',
            [$userId, $codeHash, SystemClock::db($expiresAt), SystemClock::db($now)]
        );
    }

    /** @return array{id:int,code_hash:string,expires_at:string,attempts:int}|null */
    public function findForUser(int $userId): ?array
    {
        $row = $this->run(
            'SELECT id, code_hash, expires_at, attempts FROM user_otp WHERE user_id = ? ORDER BY id DESC LIMIT 1',
            [$userId]
        )->fetch();
        if ($row === false) {
            return null;
        }
        return [
            'id' => (int) $row['id'],
            'code_hash' => (string) $row['code_hash'],
            'expires_at' => (string) $row['expires_at'],
            'attempts' => (int) $row['attempts'],
        ];
    }

    public function incrementAttempts(int $id): int
    {
        $this->run('UPDATE user_otp SET attempts = attempts + 1 WHERE id = ?', [$id]);
        return (int) $this->run('SELECT attempts FROM user_otp WHERE id = ?', [$id])->fetchColumn();
    }

    public function deleteForUser(int $userId): void
    {
        $this->run('DELETE FROM user_otp WHERE user_id = ?', [$userId]);
    }
}
