<?php

declare(strict_types=1);

namespace Mra\Repository;

use DateTimeImmutable;
use Mra\Support\SystemClock;

final class AttestationRepository extends BaseRepository
{
    public function save(
        string $hash,
        string $commitmentHash,
        int $userId,
        string $action,
        string $canonical,
        string $signature,
        string $keyFingerprint,
        ?int $leafIndex,
        DateTimeImmutable $now
    ): int {
        $this->run(
            'INSERT INTO mra_attestation
                (attestation_hash, commitment_hash, user_id, action, attestation_blob, signature,
                 client_pubkey_fpr, log_leaf_index, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$hash, $commitmentHash, $userId, $action, $canonical, $signature, $keyFingerprint, $leafIndex, SystemClock::db($now)]
        );
        return (int) $this->pdo->lastInsertId();
    }

    /** Stores the exact canonical text whose SHA-256 is the signed critical_region_digest. */
    public function saveRepresentation(int $attestationId, string $canonicalJson): void
    {
        $this->run(
            'INSERT INTO mra_attestation_representation (attestation_id, representation_json) VALUES (?, ?)',
            [$attestationId, $canonicalJson]
        );
    }

    public function representationFor(int $attestationId): ?string
    {
        $value = $this->run(
            'SELECT representation_json FROM mra_attestation_representation WHERE attestation_id = ?',
            [$attestationId]
        )->fetchColumn();
        return $value === false ? null : (string) $value;
    }

    /** @return array<string,mixed>|null */
    public function findByCommitment(string $commitmentHash): ?array
    {
        $row = $this->run('SELECT * FROM mra_attestation WHERE commitment_hash = ?', [$commitmentHash])->fetch();
        return $row === false ? null : $row;
    }

    public function count(): int
    {
        return (int) $this->run('SELECT COUNT(*) FROM mra_attestation')->fetchColumn();
    }
}
