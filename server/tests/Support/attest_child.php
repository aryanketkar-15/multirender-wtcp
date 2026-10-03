<?php

declare(strict_types=1);

// Child process for the attestation concurrency test: waits for a shared start instant, then
// submits one prepared attestation through the real kernel against the scratch database.
// Usage: php attest_child.php <request-json-file> <start-unix-microtime>

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
$response = $kernel->handle(new Request(
    'POST',
    '/api/attest',
    $spec['body'],
    ['x-csrf-token' => $spec['csrf']],
    [SessionService::COOKIE => $spec['token']],
    '203.0.113.5',
    'attest-child'
));
echo $response->status . ' ' . ($response->data()['error'] ?? 'ok');
