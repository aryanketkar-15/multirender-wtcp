<?php

declare(strict_types=1);

namespace Mra\Tests\Support;

/**
 * A deliberately naive, in-memory RFC 6962 implementation (section 2.1), used only to check the
 * database-backed log against. It shares no code with MerkleLog beyond PHP's hash function.
 */
final class ReferenceMerkle
{
    public static function leaf(string $data): string
    {
        return hash('sha256', "\x00" . $data, true);
    }

    /** @param list<string> $leafHashes raw leaf hashes */
    public static function mth(array $leafHashes): string
    {
        $n = count($leafHashes);
        if ($n === 0) {
            return hash('sha256', '', true);
        }
        if ($n === 1) {
            return $leafHashes[0];
        }
        $k = 1;
        while ($k * 2 < $n) {
            $k *= 2;
        }
        return hash('sha256', "\x01" . self::mth(array_slice($leafHashes, 0, $k)) . self::mth(array_slice($leafHashes, $k)), true);
    }

    /**
     * RFC 6962 PATH(m, D[n]).
     *
     * @param list<string> $leafHashes
     * @return list<string> raw
     */
    public static function path(int $m, array $leafHashes): array
    {
        $n = count($leafHashes);
        if ($n === 1) {
            return [];
        }
        $k = 1;
        while ($k * 2 < $n) {
            $k *= 2;
        }
        if ($m < $k) {
            return [...self::path($m, array_slice($leafHashes, 0, $k)), self::mth(array_slice($leafHashes, $k))];
        }
        return [...self::path($m - $k, array_slice($leafHashes, $k)), self::mth(array_slice($leafHashes, 0, $k))];
    }

    /**
     * RFC 6962 SUBPROOF(m, D[n], b).
     *
     * @param list<string> $leafHashes
     * @return list<string> raw
     */
    public static function subproof(int $m, array $leafHashes, bool $complete): array
    {
        $n = count($leafHashes);
        if ($m === $n) {
            return $complete ? [] : [self::mth($leafHashes)];
        }
        $k = 1;
        while ($k * 2 < $n) {
            $k *= 2;
        }
        if ($m <= $k) {
            return [...self::subproof($m, array_slice($leafHashes, 0, $k), $complete), self::mth(array_slice($leafHashes, $k))];
        }
        return [...self::subproof($m - $k, array_slice($leafHashes, $k), false), self::mth(array_slice($leafHashes, 0, $k))];
    }
}
