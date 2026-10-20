<?php

declare(strict_types=1);

// Child process for the concurrent attestation load test (server/bin/load_attest.php). It boots the
// application, waits for a shared start instant, submits one prepared attestation through the real
// kernel against the scratch database, and prints one JSON line: status, error code and latency.
// Usage: php load_child.php <request-json-file> <start-unix-microtime>

require dirname(__DIR__, 2) . '/vendor/autoload.php';

use Mra\App;
use Mra\Config\Env;
use Mra\Http\Kernel;
use Mra\Http\Request;
use Mra\Service\SessionService;

Env::load(dirname(__DIR__, 2) . '/.env');
$spec = json_decode((string) file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
$kernel = new Kernel(App::fromEnv());

$start = (float) $argv[2];
while (microtime(true) < $start) {
    usleep(200);
}
$t0 = hrtime(true);
$response = $kernel->handle(new Request(
    'POST',
    '/api/attest',
    $spec['body'],
    ['x-csrf-token' => $spec['csrf']],
    [SessionService::COOKIE => $spec['token']],
    '203.0.113.' . (1 + ($spec['i'] % 250)),
    'load-child'
));
$ms = (hrtime(true) - $t0) / 1e6;
echo json_encode([
    'i' => $spec['i'],
    'status' => $response->status,
    'error' => $response->data()['error'] ?? null,
    'log_leaf_index' => $response->data()['log_leaf_index'] ?? null,
    'commitment_leaf_index' => $response->data()['commitment_leaf_index'] ?? null,
    'ms' => round($ms, 2),
]);
