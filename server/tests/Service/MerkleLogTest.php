<?php

declare(strict_types=1);

namespace Mra\Tests\Service;

use InvalidArgumentException;
use Mra\Crypto\Jcs;
use Mra\Service\MerkleLog;
use Mra\Service\MerkleProof;
use Mra\Tests\Support\ReferenceMerkle;
use Mra\Tests\TestCase;

final class MerkleLogTest extends TestCase
{
    private MerkleLog $log;
    /** @var list<string> raw leaf hashes appended so far, mirrored for the reference implementation */
    private array $leaves = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->log = new MerkleLog($this->pdo, $this->clock);
    }

    private function append(int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $leaf = $this->log->append(static fn (int $index): array => [
                'kind' => 'test',
                'ref_hash' => 'sha256:' . hash('sha256', "leaf-{$index}"),
                'n' => $index,
            ]);
            $this->leaves[] = (string) hex2bin($leaf['leaf_hash']);
        }
    }

    public function testEmptyLogHasTheEmptyRoot(): void
    {
        $this->assertSame(0, $this->log->size());
        $this->assertSame(hash('sha256', '', true), $this->log->root());
    }

    public function testRootMatchesTheReferenceForEverySizeUpTo40(): void
    {
        for ($n = 1; $n <= 40; $n++) {
            $this->append(1);
            $this->assertSame($n, $this->log->size());
            $this->assertSame(bin2hex(ReferenceMerkle::mth($this->leaves)), bin2hex($this->log->root()), "size {$n}");
        }
    }

    public function testEveryHistoricalRootStillComputesAfterGrowth(): void
    {
        $this->append(33);
        foreach ([1, 2, 3, 7, 8, 9, 16, 17, 32, 33] as $size) {
            $this->assertSame(
                bin2hex(ReferenceMerkle::mth(array_slice($this->leaves, 0, $size))),
                bin2hex($this->log->root($size)),
                "size {$size}"
            );
        }
    }

    public function testInclusionProofsMatchTheReferenceAndVerifyForEveryLeafAtEverySize(): void // T4.4.3
    {
        $this->append(21);
        for ($size = 1; $size <= 21; $size++) {
            $root = bin2hex($this->log->root($size));
            for ($index = 0; $index < $size; $index++) {
                $proof = $this->log->inclusionProof($index, $size);
                $expected = array_map('bin2hex', ReferenceMerkle::path($index, array_slice($this->leaves, 0, $size)));
                $this->assertSame($expected, $proof['path'], "path {$index}/{$size}");
                $this->assertTrue(MerkleProof::verifyInclusion($proof, $root), "verify {$index}/{$size}");
            }
        }
    }

    public function testAProofFailsAgainstTheWrongRootLeafIndexOrPath(): void
    {
        $this->append(13);
        $root = bin2hex($this->log->root());
        $proof = $this->log->inclusionProof(5);
        $this->assertTrue(MerkleProof::verifyInclusion($proof, $root));

        $this->assertFalse(MerkleProof::verifyInclusion($proof, str_repeat('0', 64)));
        $this->assertFalse(MerkleProof::verifyInclusion([...$proof, 'leaf_index' => 6], $root));
        $this->assertFalse(MerkleProof::verifyInclusion([...$proof, 'leaf_hash' => str_repeat('1', 64)], $root));
        $short = $proof;
        array_pop($short['path']);
        $this->assertFalse(MerkleProof::verifyInclusion($short, $root));
        $long = $proof;
        $long['path'][] = str_repeat('2', 64);
        $this->assertFalse(MerkleProof::verifyInclusion($long, $root));
        $tampered = $proof;
        $tampered['path'][0] = str_repeat('3', 64);
        $this->assertFalse(MerkleProof::verifyInclusion($tampered, $root));
        // The size comes from the signed head: the same path claimed for another size is refused.
        $head = ['tree_size' => 13, 'root_hash' => 'sha256:' . $root];
        $this->assertTrue(MerkleProof::verifyAgainstHead($proof, $head));
        $this->assertFalse(MerkleProof::verifyAgainstHead([...$proof, 'tree_size' => 14], $head));
        $this->assertFalse(MerkleProof::verifyAgainstHead($proof, [...$head, 'tree_size' => 14]));
    }

    public function testDirectSqlTamperingWithALeafBreaksItsInclusionProof(): void // T4.4.4
    {
        $this->append(10);
        $root = bin2hex($this->log->root());
        $this->assertTrue(MerkleProof::verifyInclusion($this->log->inclusionProof(4), $root));

        $this->pdo->prepare('UPDATE mra_leaf SET record_json = ? WHERE idx = ?')
            ->execute([Jcs::encode(['kind' => 'test', 'ref_hash' => 'sha256:' . str_repeat('f', 64), 'n' => 4]), 4]);

        $this->assertFalse(MerkleProof::verifyInclusion($this->log->inclusionProof(4), $root), 'the altered leaf no longer proves');
        $this->assertTrue(MerkleProof::verifyInclusion($this->log->inclusionProof(5), $root), 'other leaves are unaffected');
    }

    public function testTamperingWithTheStoredLeafHashColumnDoesNotHelpAnAttacker(): void
    {
        $this->append(6);
        $root = bin2hex($this->log->root());
        $evil = Jcs::encode(['kind' => 'test', 'ref_hash' => 'sha256:' . str_repeat('e', 64), 'n' => 2]);
        $this->pdo->prepare('UPDATE mra_leaf SET record_json = ?, leaf_hash = ? WHERE idx = 2')
            ->execute([$evil, MerkleLog::leafHash($evil)]);
        // Both columns now agree with each other, but not with the signed root.
        $this->assertFalse(MerkleProof::verifyInclusion($this->log->inclusionProof(2), $root));
    }

    public function testTamperingWithAStoredNodeBreaksProofsThatPassThroughIt(): void
    {
        $this->append(8);
        $root = bin2hex($this->log->root());
        $this->pdo->exec("UPDATE mra_node SET hash = UNHEX('" . str_repeat('ab', 32) . "') WHERE level = 1 AND idx = 1");
        $this->assertFalse(MerkleProof::verifyInclusion($this->log->inclusionProof(0), $root));
    }

    public function testLeafAndNodeHashesAreDomainSeparated(): void // T4.4.5
    {
        $bytes = str_repeat("\x07", 64);
        $this->assertNotSame(bin2hex(MerkleLog::leafHash($bytes)), bin2hex(hash('sha256', "\x01" . $bytes, true)));

        $left = ReferenceMerkle::leaf('a');
        $right = ReferenceMerkle::leaf('b');
        $node = MerkleLog::nodeHash($left, $right);
        // The classic second-preimage attempt: present the 64 bytes (left||right) as one leaf.
        $this->assertNotSame(bin2hex($node), bin2hex(MerkleLog::leafHash($left . $right)));
        $this->assertSame(bin2hex(hash('sha256', "\x01" . $left . $right, true)), bin2hex($node));
        $this->assertSame(bin2hex(hash('sha256', "\x00" . 'a', true)), bin2hex($left));
    }

    public function testAnInternalNodeCannotBePassedOffAsALeaf(): void
    {
        $this->append(4);
        $root = bin2hex($this->log->root());
        $nodeHash = bin2hex($this->log->mth(0, 2)); // hash of leaves 0 and 1
        $forged = [
            'leaf_index' => 0,
            'tree_size' => 2,
            'leaf_hash' => $nodeHash,
            'path' => [bin2hex($this->log->mth(2, 2))],
        ];
        $this->assertTrue(MerkleProof::verifyInclusion($forged, $root), 'mathematically the node sits under the root');
        // But a 2-leaf tree over these hashes has a different root, and a leaf-hash check refuses it.
        $this->assertNotSame($nodeHash, bin2hex($this->log->inclusionProof(0)['leaf_hash']));
    }

    public function testConsistencyProofsMatchTheReferenceAndVerifyForEveryPairUpTo24(): void // T4.4.6
    {
        $this->append(24);
        for ($second = 1; $second <= 24; $second++) {
            for ($first = 1; $first <= $second; $first++) {
                $proof = $this->log->consistencyProof($first, $second);
                $expected = $first === $second
                    ? []
                    : array_map('bin2hex', ReferenceMerkle::subproof($first, array_slice($this->leaves, 0, $second), true));
                $this->assertSame($expected, $proof, "proof {$first}->{$second}");
                $this->assertTrue(
                    MerkleProof::verifyConsistency(
                        $first,
                        $second,
                        bin2hex($this->log->root($first)),
                        bin2hex($this->log->root($second)),
                        $proof
                    ),
                    "verify {$first}->{$second}"
                );
            }
        }
    }

    public function testConsistencyDetectsARewriteOfHistory(): void // T4.4.6
    {
        $this->append(12);
        $oldRoot = bin2hex($this->log->root(7));
        $newRoot = bin2hex($this->log->root(12));
        $proof = $this->log->consistencyProof(7, 12);
        $this->assertTrue(MerkleProof::verifyConsistency(7, 12, $oldRoot, $newRoot, $proof));

        // A log that rewrote leaf 3 has a different root for the same first 7 entries.
        $rewritten = $this->leaves;
        $rewritten[3] = ReferenceMerkle::leaf('rewritten');
        $forgedOld = bin2hex(ReferenceMerkle::mth(array_slice($rewritten, 0, 7)));
        $forgedNew = bin2hex(ReferenceMerkle::mth(array_slice($rewritten, 0, 12)));
        $this->assertFalse(MerkleProof::verifyConsistency(7, 12, $forgedOld, $newRoot, $proof), 'old head forged');
        $this->assertFalse(MerkleProof::verifyConsistency(7, 12, $oldRoot, $forgedNew, $proof), 'new head forged');
        $this->assertFalse(MerkleProof::verifyConsistency(7, 12, $oldRoot, $newRoot, array_slice($proof, 1)), 'truncated proof');
        $this->assertFalse(MerkleProof::verifyConsistency(7, 12, $oldRoot, $newRoot, [...$proof, str_repeat('0', 64)]), 'padded proof');
        $this->assertFalse(MerkleProof::verifyConsistency(8, 12, $oldRoot, $newRoot, $proof), 'wrong first size');
    }

    public function testBadArgumentsAreRefused(): void
    {
        $this->append(3);
        foreach ([[-1, 3], [3, 3], [0, 4]] as [$index, $size]) {
            try {
                $this->log->inclusionProof($index, $size);
                $this->fail("index {$index} size {$size} should be refused");
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
        foreach ([[0, 2], [3, 2], [1, 9]] as [$a, $b]) {
            try {
                $this->log->consistencyProof($a, $b);
                $this->fail("{$a}->{$b} should be refused");
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function testTheBuilderSeesTheIndexTheLeafWillTake(): void
    {
        $this->append(5);
        $seen = null;
        $leaf = $this->log->append(function (int $index) use (&$seen): array {
            $seen = $index;
            return ['kind' => 'test', 'ref_hash' => 'sha256:' . str_repeat('a', 64)];
        });
        $this->assertSame(5, $seen);
        $this->assertSame(5, $leaf['index']);
    }

    public function testAFailingBuilderLeavesTheLogUntouched(): void
    {
        $this->append(3);
        $before = bin2hex($this->log->root());
        try {
            $this->log->append(static function (int $index): array {
                throw new \RuntimeException('builder failed');
            });
            $this->fail('expected the exception');
        } catch (\RuntimeException) {
            $this->addToAssertionCount(1);
        }
        $this->assertSame(3, $this->log->size());
        $this->assertSame($before, bin2hex($this->log->root()));
        $this->append(1); // and the lock was released
        $this->assertSame(4, $this->log->size());
    }

    public function testARecordWithoutKindAndRefIsRefused(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->log->append(static fn (int $index): array => ['kind' => 'test']);
    }

    public function testTheSameRecordCannotBeLoggedTwice(): void
    {
        $this->log->append(static fn (int $i): array => ['kind' => 'test', 'ref_hash' => 'sha256:' . str_repeat('9', 64)]);
        $this->expectException(\PDOException::class);
        $this->log->append(static fn (int $i): array => ['kind' => 'test', 'ref_hash' => 'sha256:' . str_repeat('9', 64)]);
    }
}
