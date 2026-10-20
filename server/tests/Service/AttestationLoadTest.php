<?php

declare(strict_types=1);

namespace Mra\Tests\Service;

use PHPUnit\Framework\TestCase;

/**
 * Regression for a bug found by the concurrent load test (T7.3.8): attestations by DIFFERENT users,
 * submitted at the same instant, collided on the log leaf index ("Duplicate entry for key PRIMARY",
 * HTTP 500) because the append lock was released before the surrounding transaction committed.
 *
 * Runs bin/load_attest.php with real operating-system processes against a scratch database, so the
 * locking is exercised, not reasoned about.
 */
final class AttestationLoadTest extends TestCase
{
    public function testEightSimultaneousAttestationsByDifferentUsersAllSucceedAndTheLogStaysConsistent(): void
    {
        $flags = array_filter(explode(' ', (string) getenv('MRA_TEST_PHP_FLAGS')));
        $cmd = [PHP_BINARY, ...$flags, dirname(__DIR__, 2) . '/bin/load_attest.php', '8'];
        $proc = proc_open($cmd, [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes, null, getenv());
        $this->assertIsResource($proc);
        $stdout = (string) stream_get_contents($pipes[1]);
        stream_get_contents($pipes[2]);
        proc_close($proc);

        $r = json_decode($stdout, true);
        $this->assertIsArray($r, 'the load tool printed a JSON document: ' . substr($stdout, 0, 200));
        $this->assertSame(8, $r['successful_201'], 'failures: ' . json_encode($r['failures']));
        $this->assertSame(0, $r['failed']);
        $this->assertSame([], $r['child_process_errors']);
        $this->assertSame(0, $r['replay_detected_responses']);
        $this->assertSame(8, $r['attestation_rows']);
        $log = $r['log'];
        $this->assertSame($log['expected_leaves'], $log['leaves_after']);
        $this->assertTrue($log['attestation_leaf_indices_unique']);
        $this->assertTrue($log['all_leaf_indices_contiguous_from_zero']);
        $this->assertTrue($log['every_attestation_leaf_after_its_commitment_leaf']);
        $this->assertSame($log['inclusion_proofs_checked'], $log['inclusion_proofs_valid']);
    }
}
