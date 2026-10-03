<?php

declare(strict_types=1);

namespace Mra\Service;

/**
 * Stateless verification of Merkle proofs (RFC 9162 sections 2.1.3.2 and 2.1.4.2). Needs no access
 * to the database and no key: an independent verifier runs exactly this.
 */
final class MerkleProof
{
    /**
     * The check a verifier should use: the proof must be for exactly the tree the signed head
     * describes. A bare inclusion proof cannot tell some neighbouring tree sizes apart, so the size
     * is taken from the head, never trusted from the proof.
     *
     * @param array{leaf_index:int,tree_size:int,leaf_hash:string,path:list<string>} $proof
     * @param array<string,mixed> $head the record of a signed tree head (its signature checked separately)
     */
    public static function verifyAgainstHead(array $proof, array $head): bool
    {
        $root = is_string($head['root_hash'] ?? null) ? substr($head['root_hash'], 7) : '';
        return ($head['tree_size'] ?? null) === $proof['tree_size'] && self::verifyInclusion($proof, $root);
    }

    /**
     * @param array{leaf_index:int,tree_size:int,leaf_hash:string,path:list<string>} $proof hex strings
     * @param string $rootHex the signed tree head's root, lower-case hex
     */
    public static function verifyInclusion(array $proof, string $rootHex): bool
    {
        $fn = $proof['leaf_index'];
        $sn = $proof['tree_size'] - 1;
        if ($fn < 0 || $fn > $sn) {
            return false;
        }
        $r = hex2bin($proof['leaf_hash']);
        if ($r === false) {
            return false;
        }
        foreach ($proof['path'] as $hex) {
            $p = hex2bin($hex);
            if ($p === false || $sn === 0) {
                return false;
            }
            if (($fn & 1) === 1 || $fn === $sn) {
                $r = MerkleLog::nodeHash($p, $r);
                if (($fn & 1) === 0) {
                    while (($fn & 1) === 0 && $fn !== 0) {
                        $fn >>= 1;
                        $sn >>= 1;
                    }
                }
            } else {
                $r = MerkleLog::nodeHash($r, $p);
            }
            $fn >>= 1;
            $sn >>= 1;
        }
        return $sn === 0 && hash_equals($rootHex, bin2hex($r));
    }

    /**
     * @param list<string> $proofHex
     */
    public static function verifyConsistency(int $first, int $second, string $firstRootHex, string $secondRootHex, array $proofHex): bool
    {
        if ($first < 1 || $first > $second) {
            return false;
        }
        if ($first === $second) {
            return $proofHex === [] && hash_equals($firstRootHex, $secondRootHex);
        }
        $proof = [];
        foreach ($proofHex as $hex) {
            $bin = hex2bin($hex);
            if ($bin === false) {
                return false;
            }
            $proof[] = $bin;
        }
        $firstRoot = hex2bin($firstRootHex);
        if ($firstRoot === false) {
            return false;
        }
        if (($first & ($first - 1)) === 0) {
            array_unshift($proof, $firstRoot); // a complete first tree: its root is the proof's start
        }
        if ($proof === []) {
            return false;
        }
        $fn = $first - 1;
        $sn = $second - 1;
        while (($fn & 1) === 1) {
            $fn >>= 1;
            $sn >>= 1;
        }
        $fr = $sr = $proof[0];
        foreach (array_slice($proof, 1) as $c) {
            if ($sn === 0) {
                return false;
            }
            if (($fn & 1) === 1 || $fn === $sn) {
                $fr = MerkleLog::nodeHash($c, $fr);
                $sr = MerkleLog::nodeHash($c, $sr);
                while (($fn & 1) === 0 && $fn !== 0) {
                    $fn >>= 1;
                    $sn >>= 1;
                }
            } else {
                $sr = MerkleLog::nodeHash($sr, $c);
            }
            $fn >>= 1;
            $sn >>= 1;
        }
        return $sn === 0 && hash_equals($firstRootHex, bin2hex($fr)) && hash_equals($secondRootHex, bin2hex($sr));
    }
}
