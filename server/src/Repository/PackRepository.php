<?php

declare(strict_types=1);

namespace Mra\Repository;

final class PackRepository extends BaseRepository
{
    public function create(string $id, int $ownerUserId): void
    {
        $this->run('INSERT INTO evidence_pack (id, owner_user_id) VALUES (?, ?)', [$id, $ownerUserId]);
    }

    public function ownerOf(string $id): ?int
    {
        $owner = $this->run('SELECT owner_user_id FROM evidence_pack WHERE id = ?', [$id])->fetchColumn();
        return $owner === false ? null : (int) $owner;
    }
}
