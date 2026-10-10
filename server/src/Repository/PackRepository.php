<?php

declare(strict_types=1);

namespace Mra\Repository;

final class PackRepository extends BaseRepository
{
    public function create(string $id, int $ownerUserId, ?int $attestationId = null): void
    {
        $this->run(
            'INSERT INTO evidence_pack (id, owner_user_id, attestation_id) VALUES (?, ?, ?)',
            [$id, $ownerUserId, $attestationId]
        );
    }

    public function ownerOf(string $id): ?int
    {
        $owner = $this->run('SELECT owner_user_id FROM evidence_pack WHERE id = ?', [$id])->fetchColumn();
        return $owner === false ? null : (int) $owner;
    }

    /** @return array<string,mixed>|null */
    public function find(string $id): ?array
    {
        $row = $this->run(
            'SELECT p.id, p.owner_user_id, p.attestation_id, p.created_at,
                    a.action, a.attestation_hash, a.commitment_hash
             FROM evidence_pack p
             LEFT JOIN mra_attestation a ON a.id = p.attestation_id
             WHERE p.id = ?',
            [$id]
        )->fetch();
        return $row === false ? null : $row;
    }

    /** @return list<array<string,mixed>> */
    public function forUser(int $userId): array
    {
        return $this->run(
            'SELECT p.id, p.owner_user_id, p.attestation_id, p.created_at,
                    a.action, a.attestation_hash, a.commitment_hash
             FROM evidence_pack p
             LEFT JOIN mra_attestation a ON a.id = p.attestation_id
             WHERE p.owner_user_id = ?
             ORDER BY p.created_at DESC',
            [$userId]
        )->fetchAll();
    }

    /** @return array<string,mixed>|null */
    public function findByAttestation(int $attestationId): ?array
    {
        $row = $this->run('SELECT * FROM evidence_pack WHERE attestation_id = ?', [$attestationId])->fetch();
        return $row === false ? null : $row;
    }
}
