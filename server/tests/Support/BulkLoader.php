<?php

declare(strict_types=1);

namespace Mra\Tests\Support;

use Mra\Crypto\Jcs;
use Mra\Service\MerkleLog;
use PDO;

/**
 * Fills the log tables with n synthetic leaves in a few seconds, for scale tests. It computes every
 * complete-subtree node in memory with MerkleLog's own hash functions and writes them in batches;
 * the result is then checked against the independent reference implementation by the tests.
 */
final class BulkLoader
{
    /** @return list<string> raw leaf hashes, in order */
    public static function load(PDO $pdo, int $n): array
    {
        $leaves = [];
        $pdo->beginTransaction();
        $rows = [];
        for ($i = 0; $i < $n; $i++) {
            $ref = 'sha256:' . hash('sha256', 'bulk-' . $i);
            $canonical = Jcs::encode(['i' => $i, 'kind' => 'bulk', 'ref_hash' => $ref]);
            $hash = MerkleLog::leafHash($canonical);
            $leaves[] = $hash;
            $rows[] = [$i, $hash, 'bulk', $ref, $canonical];
            if (count($rows) === 1000) {
                self::insertLeaves($pdo, $rows);
                $rows = [];
            }
        }
        if ($rows !== []) {
            self::insertLeaves($pdo, $rows);
        }

        $level = 0;
        $current = $leaves;
        while (true) {
            $batch = [];
            foreach ($current as $idx => $hash) {
                $batch[] = [$level, $idx, $hash];
                if (count($batch) === 2000) {
                    self::insertNodes($pdo, $batch);
                    $batch = [];
                }
            }
            if ($batch !== []) {
                self::insertNodes($pdo, $batch);
            }
            if (count($current) < 2) {
                break;
            }
            $next = [];
            for ($j = 0; $j + 1 < count($current); $j += 2) {
                $next[] = MerkleLog::nodeHash($current[$j], $current[$j + 1]);
            }
            $current = $next;
            $level++;
        }
        $pdo->commit();
        return $leaves;
    }

    /** @param list<array{0:int,1:string,2:string,3:string,4:string}> $rows */
    private static function insertLeaves(PDO $pdo, array $rows): void
    {
        $sql = 'INSERT INTO mra_leaf (idx, leaf_hash, kind, ref_hash, record_json) VALUES '
            . implode(',', array_fill(0, count($rows), '(?, ?, ?, ?, ?)'));
        $pdo->prepare($sql)->execute(array_merge(...$rows));
    }

    /** @param list<array{0:int,1:int,2:string}> $rows */
    private static function insertNodes(PDO $pdo, array $rows): void
    {
        $sql = 'INSERT INTO mra_node (level, idx, hash) VALUES ' . implode(',', array_fill(0, count($rows), '(?, ?, ?)'));
        $pdo->prepare($sql)->execute(array_merge(...$rows));
    }
}
