<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use Mra\Config\DatabaseConfig;
use Mra\Config\Env;
use Mra\Migration\Migrator;
use Mra\Repository\Database;

Env::load(dirname(__DIR__) . '/.env');

$command = $argv[1] ?? '';
$useTest = in_array('--test', $argv, true);

if (!in_array($command, ['up', 'down', 'status'], true)) {
    fwrite(STDERR, "usage: php bin/migrate.php <up|down [steps|all]|status> [--test]\n");
    exit(2);
}

try {
    $migrator = new Migrator(
        Database::connection(DatabaseConfig::fromEnv($useTest)),
        dirname(__DIR__) . '/migrations'
    );
    if ($command === 'up') {
        $done = $migrator->up();
        echo $done === [] ? "Nothing to migrate.\n" : 'Applied: ' . implode(', ', $done) . "\n";
    } elseif ($command === 'down') {
        $arg = $argv[2] ?? '1';
        $steps = $arg === 'all' ? PHP_INT_MAX : max(1, (int) $arg);
        $done = $migrator->down($steps);
        echo $done === [] ? "Nothing to revert.\n" : 'Reverted: ' . implode(', ', $done) . "\n";
    } else {
        foreach ($migrator->applied() as $version => $name) {
            echo "{$version} {$name}\n";
        }
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'migrate failed: ' . $e->getMessage() . "\n");
    exit(1);
}
