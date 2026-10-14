<?php

declare(strict_types=1);

/**
 * Cost measurement (milestone 6.3): time the real MerkleLog::inclusionProof on logs of 10k, 100k and
 * 1M leaves in a scratch database, and the real MerkleProof::verifyInclusion on each proof.
 * Development tool: needs the dev autoloader (tests/Support) and a database user that can create
 * databases. Prints one JSON document on stdout; progress goes to stderr.
 *
 *   php bin/measure_proofs.php [samples] [size ...]
 */

use Mra\Config\Env;
use Mra\Service\MerkleLog;
use Mra\Service\MerkleProof;
use Mra\Support\SystemClock;
use Mra\Tests\Support\BulkLoader;
use Mra\Tests\Support\ScratchDatabase;

require dirname(__DIR__) . '/vendor/autoload.php';
Env::load(dirname(__DIR__) . '/.env');
ini_set('memory_limit', '-1');

$samples = (int) ($argv[1] ?? 200);
$sizes = array_map('intval', array_slice($argv, 2)) ?: [10000, 100000, 1000000];
$name = 'mra_scratch_cost';

/** @param list<float> $v */
function pct(array $v, float $p): float
{
    sort($v);
    return round($v[(int) min(count($v) - 1, floor($p * count($v)))], 4);
}

$out = ['tool' => 'server/bin/measure_proofs.php', 'php' => PHP_VERSION, 'samples_per_size' => $samples, 'sizes' => []];
foreach ($sizes as $n) {
    fwrite(STDERR, "loading {$n} leaves...\n");
    $t = microtime(true);
    $config = ScratchDatabase::create($name);
    $pdo = ScratchDatabase::pdo($config);
    BulkLoader::load($pdo, $n);
    $loadSeconds = microtime(true) - $t;
    $log = new MerkleLog($pdo, new SystemClock());
    $root = bin2hex($log->root());

    $gen = [];
    $ver = [];
    $paths = [];
    mt_srand(20261010);
    for ($i = 0; $i < $samples; $i++) {
        $index = mt_rand(0, $n - 1);
        $t0 = hrtime(true);
        $proof = $log->inclusionProof($index);
        $gen[] = (hrtime(true) - $t0) / 1e6;
        $t1 = hrtime(true);
        $ok = MerkleProof::verifyInclusion($proof, $root);
        $ver[] = (hrtime(true) - $t1) / 1e6;
        if (!$ok) {
            fwrite(STDERR, "PROOF FAILED to verify for leaf {$index}\n");
            exit(1);
        }
        $paths[] = count($proof['path']);
    }
    $out['sizes'][] = [
        'leaves' => $n,
        'bulk_load_seconds' => round($loadSeconds, 1),
        'path_hashes_min' => min($paths),
        'path_hashes_max' => max($paths),
        'ceil_log2' => (int) ceil(log($n, 2)),
        'generate_ms' => ['p50' => pct($gen, 0.5), 'p95' => pct($gen, 0.95), 'max' => round(max($gen), 4)],
        'verify_ms' => ['p50' => pct($ver, 0.5), 'p95' => pct($ver, 0.95), 'max' => round(max($ver), 4)],
    ];
    unset($pdo, $log);
    ScratchDatabase::drop($name);
}
echo json_encode($out, JSON_PRETTY_PRINT) . "\n";
