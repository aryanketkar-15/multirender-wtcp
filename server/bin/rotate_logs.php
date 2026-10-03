<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use Mra\Config\DatabaseConfig;
use Mra\Config\Env;
use Mra\Log\LogRotator;
use Mra\Log\SecurityLogger;
use Mra\Repository\Database;

Env::load(dirname(__DIR__) . '/.env');

// Rotation deletes rows, which the application account is not permitted to do on the log tables.
// A maintenance account is used when configured.
$config = DatabaseConfig::fromEnv(in_array('--test', $argv, true));
if (Env::get('DB_MAINT_USER') !== null) {
    $config['user'] = Env::require('DB_MAINT_USER');
    $config['pass'] = Env::get('DB_MAINT_PASS', '') ?? '';
}

$retention = (int) (Env::get('LOG_RETENTION_DAYS', '90') ?? '90');
$maxRows = (int) (Env::get('LOG_MAX_ROWS', '1000000') ?? '1000000');
$exit = 0;

try {
    $pdo = Database::connection($config);
    $rotator = new LogRotator($pdo, $retention, $maxRows);
    foreach (LogRotator::TABLES as $table) {
        $r = $rotator->rotate($table);
        printf(
            "%s: archived %d to %s, live %d, %s\n",
            $r['table'],
            $r['archived'],
            $r['archive'],
            $r['live_after'],
            $r['reconciled'] ? 'reconciled' : 'COUNT MISMATCH'
        );
        if (!$r['reconciled']) {
            $exit = 1;
        }
        if ($r['over_cap']) {
            (new SecurityLogger($pdo))->record('log.size_cap_exceeded', 'warning', null, [
                'table' => $table,
                'live_rows' => $r['live_after'],
                'cap' => $maxRows,
            ]);
            fwrite(STDERR, "ALERT: {$table} exceeds the size cap of {$maxRows} rows\n");
            $exit = max($exit, 3);
        }
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'rotate_logs failed: ' . $e->getMessage() . "\n");
    exit(1);
}
exit($exit);
