<?php

declare(strict_types=1);

namespace Mra\Service;

use InvalidArgumentException;
use Mra\Crypto\Jcs;
use Mra\Repository\BaseRepository;
use Mra\Support\Clock;
use Mra\Support\SystemClock;
use PDO;
use RuntimeException;

/**
 * Append-only Merkle log, RFC 6962 / RFC 9162.
 *
 *   leaf   = SHA-256(0x00 || JCS(record))
 *   parent = SHA-256(0x01 || left || right)
 *
 * The one-byte domain separation is not optional: without it an internal node could be presented as
 * a leaf (a second-preimage attack). The hash of every complete subtree is stored when it is
 * completed, so a root or a proof costs O(log n) lookups. The application database account holds
 * INSERT and SELECT only on these tables (see GrantPolicy).
 *
 * Appends are serialised by a MySQL named lock, and the caller's closure runs inside it: the leaf
 * index a record will occupy is known to the record before it is written, which is how a commitment
 * can carry its own `log_leaf_index` inside its signature.
 */
final class MerkleLog extends BaseRepository
{
    private const LOCK = 'mra_merkle_log';

    public function __construct(PDO $pdo, private readonly Clock $clock)
    {
        parent::__construct($pdo);
    }

    public static function leafHash(string $canonical): string
    {
        return hash('sha256', "\x00" . $canonical, true);
    }

    public static function nodeHash(string $left, string $right): string
    {
        return hash('sha256', "\x01" . $left . $right, true);
    }

    public static function emptyRoot(): string
    {
        return hash('sha256', '', true);
    }

    /** Largest power of two strictly less than $n (n must be at least 2). */
    public static function split(int $n): int
    {
        $k = 1;
        while (($k << 1) < $n) {
            $k <<= 1;
        }
        return $k;
    }

    public function size(): int
    {
        return (int) $this->run('SELECT COALESCE(MAX(idx) + 1, 0) FROM mra_leaf')->fetchColumn();
    }

    /**
     * Appends one record. `$build` receives the index the leaf will take and returns the record,
     * which must carry string members `kind` and `ref_hash`. It runs inside the append lock and the
     * transaction, so anything it writes commits or rolls back together with the leaf.
     *
     * @param callable(int):array<string,mixed> $build
     * @return array{index:int,leaf_hash:string} leaf_hash is lower-case hex
     */
    public function append(callable $build): array
    {
        $got = (int) $this->run('SELECT GET_LOCK(?, 10)', [self::LOCK])->fetchColumn();
        if ($got !== 1) {
            throw new RuntimeException('Could not acquire the log append lock.');
        }
        $owns = !$this->pdo->inTransaction();
        try {
            if ($owns) {
                $this->pdo->beginTransaction();
            }
            $index = $this->size();
            $record = $build($index);
            foreach (['kind', 'ref_hash'] as $required) {
                if (!isset($record[$required]) || !is_string($record[$required])) {
                    throw new InvalidArgumentException("Log record needs a string member {$required}.");
                }
            }
            $canonical = Jcs::encode($record);
            $leaf = self::leafHash($canonical);

            $this->run(
                'INSERT INTO mra_leaf (idx, leaf_hash, kind, ref_hash, record_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [$index, $leaf, $record['kind'], $record['ref_hash'], $canonical, SystemClock::db($this->clock->now())]
            );
            $this->writeNodes($index, $leaf);
            if ($owns) {
                $this->pdo->commit();
            }
            return ['index' => $index, 'leaf_hash' => bin2hex($leaf)];
        } catch (\Throwable $e) {
            if ($owns && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        } finally {
            $this->run('SELECT RELEASE_LOCK(?)', [self::LOCK])->fetchColumn();
        }
    }

    /** Stores the leaf at level 0, then every parent this leaf completes. */
    private function writeNodes(int $index, string $leaf): void
    {
        $insert = 'INSERT INTO mra_node (level, idx, hash) VALUES (?, ?, ?)';
        $this->run($insert, [0, $index, $leaf]);
        $hash = $leaf;
        $level = 0;
        $pos = $index;
        while (($pos & 1) === 1) {
            $left = $this->node($level, $pos - 1);
            $hash = self::nodeHash($left, $hash);
            $level++;
            $pos >>= 1;
            $this->run($insert, [$level, $pos, $hash]);
        }
    }

    private function node(int $level, int $idx): string
    {
        $hash = $this->run('SELECT hash FROM mra_node WHERE level = ? AND idx = ?', [$level, $idx])->fetchColumn();
        if ($hash === false) {
            throw new RuntimeException("Log node ({$level}, {$idx}) is missing.");
        }
        return (string) $hash;
    }

    /** Hash of the subtree covering leaves [start, start + n). Raw 32 bytes. */
    public function mth(int $start, int $n): string
    {
        if ($n === 0) {
            return self::emptyRoot();
        }
        if (($n & ($n - 1)) === 0 && $start % $n === 0) {
            return $this->node((int) log($n, 2), intdiv($start, $n));
        }
        $k = self::split($n);
        return self::nodeHash($this->mth($start, $k), $this->mth($start + $k, $n - $k));
    }

    /** Merkle tree hash of the first $size leaves (default: the whole log). Raw 32 bytes. */
    public function root(?int $size = null): string
    {
        $size ??= $this->size();
        $this->assertSize($size);
        return $this->mth(0, $size);
    }

    /**
     * Inclusion proof for a leaf, built from the leaf's stored record (the hash is recomputed from
     * the record, not read back), so a record altered in SQL yields a proof that cannot verify.
     *
     * @return array{leaf_index:int,tree_size:int,leaf_hash:string,path:list<string>} hex strings
     */
    public function inclusionProof(int $index, ?int $size = null): array
    {
        $size ??= $this->size();
        $this->assertSize($size);
        if ($index < 0 || $index >= $size) {
            throw new InvalidArgumentException('Leaf index is outside the tree.');
        }
        $leaf = $this->leaf($index) ?? throw new RuntimeException('Leaf is missing.');

        $siblings = [];
        $start = 0;
        $n = $size;
        $m = $index;
        while ($n > 1) {
            $k = self::split($n);
            if ($m < $k) {
                $siblings[] = $this->mth($start + $k, $n - $k);
                $n = $k;
            } else {
                $siblings[] = $this->mth($start, $k);
                $start += $k;
                $m -= $k;
                $n -= $k;
            }
        }
        return [
            'leaf_index' => $index,
            'tree_size' => $size,
            'leaf_hash' => bin2hex(self::leafHash($leaf['record_json'])),
            'path' => array_map('bin2hex', array_reverse($siblings)),
        ];
    }

    /**
     * Consistency proof that the first $first leaves are a prefix of the first $second.
     *
     * @return list<string> hex strings
     */
    public function consistencyProof(int $first, int $second): array
    {
        $this->assertSize($second);
        if ($first < 1 || $first > $second) {
            throw new InvalidArgumentException('Need 1 <= first <= second.');
        }
        return array_map('bin2hex', $first === $second ? [] : $this->subproof($first, 0, $second, true));
    }

    /** @return list<string> */
    private function subproof(int $m, int $start, int $n, bool $complete): array
    {
        if ($m === $n) {
            return $complete ? [] : [$this->mth($start, $n)];
        }
        $k = self::split($n);
        if ($m <= $k) {
            return [...$this->subproof($m, $start, $k, $complete), $this->mth($start + $k, $n - $k)];
        }
        return [...$this->subproof($m - $k, $start + $k, $n - $k, false), $this->mth($start, $k)];
    }

    /** @return array{idx:int,kind:string,ref_hash:string,record_json:string,leaf_hash:string,created_at:string}|null */
    public function leaf(int $index): ?array
    {
        $row = $this->run(
            'SELECT idx, kind, ref_hash, record_json, leaf_hash, created_at FROM mra_leaf WHERE idx = ?',
            [$index]
        )->fetch();
        if ($row === false) {
            return null;
        }
        return [
            'idx' => (int) $row['idx'],
            'kind' => (string) $row['kind'],
            'ref_hash' => (string) $row['ref_hash'],
            'record_json' => (string) $row['record_json'],
            'leaf_hash' => (string) $row['leaf_hash'],
            'created_at' => (string) $row['created_at'],
        ];
    }

    private function assertSize(int $size): void
    {
        if ($size < 0 || $size > $this->size()) {
            throw new InvalidArgumentException('Tree size is larger than the log.');
        }
    }
}
