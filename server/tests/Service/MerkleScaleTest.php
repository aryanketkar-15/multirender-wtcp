<?php

declare(strict_types=1);

namespace Mra\Tests\Service;

use Mra\Service\MerkleLog;
use Mra\Service\MerkleProof;
use Mra\Support\SystemClock;
use Mra\Tests\Support\BulkLoader;
use Mra\Tests\Support\ReferenceMerkle;
use Mra\Tests\Support\ScratchDatabase;
use PHPUnit\Framework\TestCase;

/** T4.4.10 and T4.4.11: proof size and proof time on large logs, in a scratch database. */
final class MerkleScaleTest extends TestCase
{
    private const DB = 'mra_scratch_scale';

    protected function tearDown(): void
    {
        ScratchDatabase::drop(self::DB);
    }

    private function log(int $leaves): array
    {
        $config = ScratchDatabase::create(self::DB);
        $pdo = ScratchDatabase::pdo($config);
        $hashes = BulkLoader::load($pdo, $leaves);
        return [new MerkleLog($pdo, new SystemClock()), $hashes];
    }

    public function testTheBulkLoadedLogAgreesWithTheReferenceImplementation(): void
    {
        [$log, $hashes] = $this->log(1000);
        $this->assertSame(1000, $log->size());
        $this->assertSame(bin2hex(ReferenceMerkle::mth($hashes)), bin2hex($log->root()));
        foreach ([0, 1, 499, 998, 999] as $index) {
            $this->assertSame(
                array_map('bin2hex', ReferenceMerkle::path($index, $hashes)),
                $log->inclusionProof($index)['path']
            );
        }
    }

    public function testProofSizeIsLogarithmicAt10000Leaves(): void // T4.4.10
    {
        [$log] = $this->log(10000);
        $root = bin2hex($log->root());
        $lengths = [];
        foreach ([0, 1, 4999, 5000, 9998, 9999] as $index) {
            $proof = $log->inclusionProof($index);
            $lengths[] = count($proof['path']);
            $this->assertTrue(MerkleProof::verifyInclusion($proof, $root), "leaf {$index}");
        }
        $this->assertLessThanOrEqual(14, max($lengths), 'ceil(log2(10000)) = 14');
        $this->assertGreaterThanOrEqual(13, max($lengths));
        fwrite(STDERR, sprintf("\n[phase 6 input] 10,000 leaves: proof lengths %s hashes\n", implode('/', $lengths)));
    }

    public function testAProofOnA100000LeafLogTakesUnder100Milliseconds(): void // T4.4.11
    {
        $start = microtime(true);
        [$log] = $this->log(100000);
        $loadSeconds = microtime(true) - $start;
        $root = bin2hex($log->root());

        $times = [];
        mt_srand(42);
        for ($i = 0; $i < 25; $i++) {
            $index = mt_rand(0, 99999);
            $t = hrtime(true);
            $proof = $log->inclusionProof($index);
            $times[] = (hrtime(true) - $t) / 1e6;
            $this->assertTrue(MerkleProof::verifyInclusion($proof, $root), "leaf {$index}");
        }
        sort($times);
        $median = $times[(int) (count($times) / 2)];
        $worst = end($times);
        fwrite(STDERR, sprintf(
            "\n[phase 6 input] 100,000 leaves: inclusion proof median %.1f ms, worst %.1f ms, path %d hashes (bulk load %.1f s)\n",
            $median,
            $worst,
            count($proof['path']),
            $loadSeconds
        ));
        $this->assertLessThan(100, $median, "median {$median} ms");
        $this->assertLessThan(250, $worst, "worst {$worst} ms");
    }

    public function testConsistencyProofsStayCheapOnALargeLog(): void
    {
        [$log] = $this->log(20000);
        $t = hrtime(true);
        $proof = $log->consistencyProof(12345, 20000);
        $ms = (hrtime(true) - $t) / 1e6;
        $this->assertTrue(MerkleProof::verifyConsistency(
            12345,
            20000,
            bin2hex($log->root(12345)),
            bin2hex($log->root()),
            $proof
        ));
        $this->assertLessThan(200, $ms);
        $this->assertLessThanOrEqual(2 * 15, count($proof));
    }
}
