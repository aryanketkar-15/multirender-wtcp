<?php

declare(strict_types=1);

// Applies table-level grants for the application account (see Mra\Repository\GrantPolicy).
// Run with an administrative account (DB_ADMIN_USER / DB_ADMIN_PASS); never with the app account.

require dirname(__DIR__) . '/vendor/autoload.php';

use Mra\Config\DatabaseConfig;
use Mra\Config\Env;
use Mra\Repository\Database;
use Mra\Repository\GrantPolicy;

Env::load(dirname(__DIR__) . '/.env');

$config = DatabaseConfig::fromEnv();
$config['user'] = Env::require('DB_ADMIN_USER');
$config['pass'] = Env::get('DB_ADMIN_PASS', '') ?? '';
$granted = GrantPolicy::apply(
    Database::connection($config),
    $config['name'],
    Env::require('APP_DB_USER'),
    Env::get('APP_DB_HOST', 'localhost') ?? 'localhost'
);
foreach ($granted as $table => $privileges) {
    echo str_pad($table, 32) . $privileges . "\n";
}
