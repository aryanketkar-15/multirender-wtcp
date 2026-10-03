<?php

declare(strict_types=1);

// Child process for the concurrency test: waits for a shared start instant, then tries to consume a nonce.
// Usage: php consume_nonce.php <nonce> <session-id> <start-unix-microtime>

require dirname(__DIR__, 2) . '/vendor/autoload.php';

use Mra\Config\DatabaseConfig;
use Mra\Config\Env;
use Mra\Repository\Database;
use Mra\Service\NonceService;
use Mra\Support\SystemClock;

Env::load(dirname(__DIR__, 2) . '/.env');
$pdo = Database::connection(DatabaseConfig::fromEnv(true));
$service = new NonceService($pdo, new SystemClock());

$start = (float) $argv[3];
while (microtime(true) < $start) {
    usleep(200);
}
echo $service->consume($argv[1], $argv[2]) ? '1' : '0';
