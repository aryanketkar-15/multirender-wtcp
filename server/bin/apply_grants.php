<?php

declare(strict_types=1);

/**
 * Applies table-level grants for the application account. The two operational log tables are
 * INSERT-only: the application can append but never read back, alter or delete its own trail.
 * Run with an administrative account (DB_ADMIN_USER / DB_ADMIN_PASS); never with the app account.
 */

require dirname(__DIR__) . '/vendor/autoload.php';

use Mra\Config\DatabaseConfig;
use Mra\Config\Env;
use Mra\Repository\Database;

Env::load(dirname(__DIR__) . '/.env');

$app = Env::require('APP_DB_USER');
$host = Env::get('APP_DB_HOST', 'localhost') ?? 'localhost';
$config = DatabaseConfig::fromEnv();
$config['user'] = Env::require('DB_ADMIN_USER');
$config['pass'] = Env::get('DB_ADMIN_PASS', '') ?? '';
$pdo = Database::connection($config);

$insertOnly = ['audit_log', 'security_log'];
$tables = $pdo->query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = "BASE TABLE"'
)->fetchAll(PDO::FETCH_COLUMN);

$db = $config['name'];
$pdo->exec("REVOKE ALL PRIVILEGES, GRANT OPTION FROM `{$app}`@`{$host}`");
foreach ($tables as $table) {
    $privileges = in_array($table, $insertOnly, true) || str_contains($table, '_archive_')
        ? 'INSERT'
        : 'SELECT, INSERT, UPDATE, DELETE';
    $pdo->exec("GRANT {$privileges} ON `{$db}`.`{$table}` TO `{$app}`@`{$host}`");
    echo str_pad($table, 32) . $privileges . "\n";
}
$pdo->exec('FLUSH PRIVILEGES');
