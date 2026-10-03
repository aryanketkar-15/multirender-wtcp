<?php

declare(strict_types=1);

namespace Mra\Repository;

use DateTimeImmutable;
use DateTimeZone;
use Mra\Model\Session;
use Mra\Support\SystemClock;

/** Sessions are keyed by the SHA-256 of the cookie token, so a database read yields no usable ids. */
final class SessionRepository extends BaseRepository
{
    public function insert(string $idHash, ?int $userId, string $csrf, DateTimeImmutable $now): void
    {
        $this->run(
            'INSERT INTO sessions (id, user_id, csrf_token, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
            [$idHash, $userId, $csrf, SystemClock::db($now), SystemClock::db($now)]
        );
    }

    public function find(string $idHash): ?Session
    {
        $row = $this->run('SELECT * FROM sessions WHERE id = ?', [$idHash])->fetch();
        if ($row === false) {
            return null;
        }
        $utc = new DateTimeZone('UTC');
        return new Session(
            (string) $row['id'],
            $row['user_id'] === null ? null : (int) $row['user_id'],
            (string) $row['csrf_token'],
            new DateTimeImmutable((string) $row['created_at'], $utc),
            new DateTimeImmutable((string) $row['last_seen_at'], $utc),
            $row['client_pubkey_fpr'] === null ? null : (string) $row['client_pubkey_fpr']
        );
    }

    public function setClientKey(string $idHash, string $fingerprint): void
    {
        $this->run('UPDATE sessions SET client_pubkey_fpr = ? WHERE id = ?', [$fingerprint, $idHash]);
    }

    public function touch(string $idHash, DateTimeImmutable $now): void
    {
        $this->run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [SystemClock::db($now), $idHash]);
    }

    public function delete(string $idHash): void
    {
        $this->run('DELETE FROM sessions WHERE id = ?', [$idHash]);
    }

    public function deleteForUser(int $userId): int
    {
        return $this->run('DELETE FROM sessions WHERE user_id = ?', [$userId])->rowCount();
    }

    public function deleteStale(DateTimeImmutable $idleBefore, DateTimeImmutable $createdBefore): int
    {
        return $this->run(
            'DELETE FROM sessions WHERE last_seen_at < ? OR created_at < ?',
            [SystemClock::db($idleBefore), SystemClock::db($createdBefore)]
        )->rowCount();
    }
}
