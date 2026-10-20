<?php

/**
 * Concurrent attestation load test (T7.3.8). Development tool: needs the dev autoloader and a database
 * user that can create databases.
 *
 * It creates a scratch database, registers an attestor, prepares N verified users each with a session,
 * a registered client key and a committed bundle, then starts N real operating-system processes that
 * submit their attestation at the same instant through the real kernel against the real database.
 * Afterwards it checks the log: no failures, no replayed nonce, unique and contiguous leaf indices,
 * every attestation leaf after its commitment leaf, a signed tree head over all leaves, and an
 * inclusion proof for every leaf that verifies. Prints one JSON document; progress goes to stderr.
 *
 *   php bin/load_attest.php [concurrency]       (default 100)
 */

declare(strict_types=1);

use Mra\App;
use Mra\Config\Env;
use Mra\Http\Kernel;
use Mra\Http\Request;
use Mra\Repository\Database;
use Mra\Service\MerkleProof;
use Mra\Service\SessionService;
use Mra\Tests\Support\ClientSimulator;
use Mra\Tests\Support\ScratchDatabase;

require dirname(__DIR__) . '/vendor/autoload.php';
Env::load(dirname(__DIR__) . '/.env');
ini_set('memory_limit', '-1');

$n = (int) ($argv[1] ?? 100);
$name = 'mra_scratch_load';
$env = ['APP_ENV' => 'test', 'DB_TEST_NAME' => $name, 'ATTESTOR_BASE_URL' => 'http://attestor.test'];
ScratchDatabase::create($name);
foreach ($env as $k => $v) {
    putenv("{$k}={$v}");
}

$app = App::fromEnv();
$app->attestors->register([
    'version' => '1.1.0',
    'file' => 'mra-attestor-1.1.0.js',
    'sha384' => 'sha384-' . str_repeat('A', 64),
    'sha256' => 'sha256:' . str_repeat('c', 64),
]);
$kernel = new Kernel($app);

fwrite(STDERR, "preparing {$n} users...\n");
$specs = [];
for ($i = 0; $i < $n; $i++) {
    $client = ClientSimulator::create();
    $id = $app->users->create("load{$i}@example.com", "Load {$i}", 'h');
    $app->users->markVerified($id);
    $made = $app->sessions->create($id);
    $headers = ['x-csrf-token' => $made['session']->csrfToken];
    $cookies = [SessionService::COOKIE => $made['token']];
    $ip = '198.51.100.' . (1 + ($i % 250));
    $kernel->handle(new Request('POST', '/api/client-key', ['fingerprint' => $client->fingerprint], $headers, $cookies, $ip));
    $bundle = $kernel->handle(new Request('GET', '/api/bundle', [], $headers, $cookies, $ip))->data();
    $specs[$i] = ['i' => $i, 'token' => $made['token'], 'csrf' => $made['session']->csrfToken, 'body' => $client->body($bundle)];
}
$leavesBefore = $app->log->size();

$flags = array_filter(explode(' ', (string) getenv('MRA_TEST_PHP_FLAGS')));
$script = dirname(__DIR__) . '/tests/Support/load_child.php';
$start = microtime(true) + 6.0 + $n * 0.05;
$procs = [];
$pipes = [];
$files = [];
$childEnv = array_merge(getenv(), $env);
fwrite(STDERR, "starting {$n} processes...\n");
for ($i = 0; $i < $n; $i++) {
    $file = tempnam(sys_get_temp_dir(), 'mra-load-') ?: throw new RuntimeException('tmp');
    file_put_contents($file, json_encode($specs[$i]));
    $files[$i] = $file;
    $cmd = [PHP_BINARY, ...$flags, $script, $file, (string) $start];
    $procs[$i] = proc_open($cmd, [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes[$i], null, $childEnv);
}
$wall0 = microtime(true);
$results = [];
$childErrors = [];
foreach ($procs as $i => $proc) {
    $out = trim((string) stream_get_contents($pipes[$i][1]));
    $err = trim((string) stream_get_contents($pipes[$i][2]));
    proc_close($proc);
    @unlink($files[$i]);
    $row = json_decode($out, true);
    if (!is_array($row)) {
        $childErrors[] = ['i' => $i, 'stdout' => $out, 'stderr' => substr($err, 0, 300)];
        continue;
    }
    if ($err !== '') {
        $row['stderr'] = substr($err, 0, 600);
    }
    $results[] = $row;
}

/** @param list<float> $v */
$pct = static function (array $v, float $p): float {
    sort($v);
    return $v === [] ? 0.0 : round($v[(int) min(count($v) - 1, floor($p * count($v)))], 2);
};

$ok = array_values(array_filter($results, static fn (array $r): bool => $r['status'] === 201));
$failed = array_values(array_filter($results, static fn (array $r): bool => $r['status'] !== 201));
$latencies = array_map(static fn (array $r): float => (float) $r['ms'], $results);

// Log checks, after all writers have finished.
$app2 = App::fromEnv();
$size = $app2->log->size();
$indices = array_map(static fn (array $r): int => (int) $r['log_leaf_index'], $ok);
$commitIndices = array_map(static fn (array $r): int => (int) $r['commitment_leaf_index'], $ok);
$sortedAll = $indices;
sort($sortedAll);
$orderOk = true;
$adjacent = 0;
foreach ($ok as $r) {
    if ((int) $r['commitment_leaf_index'] >= (int) $r['log_leaf_index']) {
        $orderOk = false;
    }
    if ((int) $r['log_leaf_index'] === (int) $r['commitment_leaf_index'] + 1) {
        $adjacent++;
    }
}
$allIdx = array_merge($indices, $commitIndices);
sort($allIdx);
$head = $app2->sth->sign();
$root = bin2hex($app2->log->root());
$proofsValid = 0;
$proofsChecked = 0;
for ($idx = 0; $idx < $size; $idx++) {
    $proof = $app2->log->inclusionProof($idx, (int) $head['record']['tree_size']);
    $proofsChecked++;
    if (MerkleProof::verifyAgainstHead($proof, $head['record'])) {
        $proofsValid++;
    }
}
$nonceReplays = count(array_filter($results, static fn (array $r): bool => $r['error'] === 'REPLAY_DETECTED'));
$attestationRows = $app2->attestations->count();

$out = [
    'tool' => 'server/bin/load_attest.php',
    'test_id' => 'T7.3.8',
    'measured_at' => gmdate('Y-m-d\TH:i:s\Z'),
    'concurrency' => $n,
    'processes_started_at_the_same_instant' => true,
    'requests_completed' => count($results),
    'successful_201' => count($ok),
    'failed' => count($failed),
    'failures' => array_slice($failed, 0, 5),
    'child_process_errors' => $childErrors,
    'replay_detected_responses' => $nonceReplays,
    'attestation_rows' => $attestationRows,
    'latency_ms_per_request' => ['min' => $pct($latencies, 0.0), 'p50' => $pct($latencies, 0.5), 'p95' => $pct($latencies, 0.95), 'p99' => $pct($latencies, 0.99), 'max' => $latencies === [] ? 0 : round(max($latencies), 2)],
    'wall_clock_seconds_for_all' => round(microtime(true) - $wall0, 2),
    'log' => [
        'leaves_before_attesting' => $leavesBefore,
        'leaves_after' => $size,
        'expected_leaves' => $leavesBefore + count($ok),
        'attestation_leaf_indices_unique' => count(array_unique($indices)) === count($indices),
        'all_leaf_indices_contiguous_from_zero' => $allIdx === range(0, $size - 1),
        'every_attestation_leaf_after_its_commitment_leaf' => $orderOk,
        'attestation_leaf_directly_after_its_commitment_leaf' => $adjacent,
        'signed_tree_size' => (int) $head['record']['tree_size'],
        'root_hash' => 'sha256:' . $root,
        'inclusion_proofs_checked' => $proofsChecked,
        'inclusion_proofs_valid' => $proofsValid,
    ],
    'environment' => ['php' => PHP_VERSION, 'os' => PHP_OS, 'database' => 'MariaDB (scratch database on the dev instance)', 'note' => 'application kernel in separate OS processes, no HTTP layer: the PHP built-in server is single-threaded'],
];
echo json_encode($out, JSON_PRETTY_PRINT) . "\n";
unset($app, $app2);
ScratchDatabase::drop($name);
