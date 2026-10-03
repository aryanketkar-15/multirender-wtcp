<?php

declare(strict_types=1);

namespace Mra\Repository;

use Mra\Model\Bundle;
use Mra\Service\BundleBuilder;

final class BundleRepository extends BaseRepository
{
    /** Idempotent on bundle_id: the same bundle stored twice is one row; a different one is refused. */
    public function save(Bundle $bundle): void
    {
        $existing = $this->hashOf($bundle->bundleId);
        if ($existing !== null) {
            if ($existing !== $bundle->hash) {
                throw new \RuntimeException('bundle_id already used for different content.');
            }
            return;
        }
        $this->run(
            'INSERT INTO mra_bundle (bundle_id, canonical_blob, bundle_hash, region_policy) VALUES (?, ?, ?, ?)',
            [$bundle->bundleId, $bundle->canonical, $bundle->hash, $bundle->regionPolicy]
        );
    }

    public function hashOf(string $bundleId): ?string
    {
        $hash = $this->run('SELECT bundle_hash FROM mra_bundle WHERE bundle_id = ?', [$bundleId])->fetchColumn();
        return $hash === false ? null : (string) $hash;
    }

    /** Returns the stored canonical text only if it still hashes to the stored hash. */
    public function canonical(string $bundleId): ?string
    {
        $row = $this->run('SELECT canonical_blob, bundle_hash FROM mra_bundle WHERE bundle_id = ?', [$bundleId])->fetch();
        if ($row === false || BundleBuilder::hashOf((string) $row['canonical_blob']) !== $row['bundle_hash']) {
            return null;
        }
        return (string) $row['canonical_blob'];
    }
}
