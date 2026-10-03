<?php

declare(strict_types=1);

namespace Mra\Repository;

use DateTimeImmutable;
use DateTimeZone;
use Mra\Support\SystemClock;

final class CommitmentRepository extends BaseRepository
{
    /** @param array<string,mixed> $commitment */
    public function save(array $commitment, string $canonical, string $hash, string $signature): void
    {
        $utc = new DateTimeZone('UTC');
        $this->run(
            'INSERT INTO mra_commitment
                (session_id, bundle_id, commitment_hash, commitment_blob, signature, key_id, issued_at, expires_at, log_leaf_index)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $commitment['session_id'],
                $commitment['bundle_id'],
                $hash,
                $canonical,
                $signature,
                $commitment['key_id'],
                SystemClock::db(new DateTimeImmutable((string) $commitment['issued_at'], $utc)),
                SystemClock::db(new DateTimeImmutable((string) $commitment['expires_at'], $utc)),
                $commitment['log_leaf_index'],
            ]
        );
    }

    /** @return array{commitment_blob:string,signature:string,key_id:string}|null */
    public function findByHash(string $hash): ?array
    {
        $row = $this->run(
            'SELECT commitment_blob, signature, key_id FROM mra_commitment WHERE commitment_hash = ?',
            [$hash]
        )->fetch();
        return $row === false ? null : [
            'commitment_blob' => (string) $row['commitment_blob'],
            'signature' => (string) $row['signature'],
            'key_id' => (string) $row['key_id'],
        ];
    }
}
