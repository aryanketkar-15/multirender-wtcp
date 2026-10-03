<?php

declare(strict_types=1);

use Mra\Config\DatabaseConfig;
use Mra\Config\Env;
use Mra\Migration\Migrator;
use Mra\Repository\Database;

require dirname(__DIR__) . '/vendor/autoload.php';

Env::load(dirname(__DIR__) . '/.env');

// Bring the shared test schema up to date once per run (idempotent).
(new Migrator(Database::connection(DatabaseConfig::fromEnv(true)), dirname(__DIR__) . '/migrations'))->up();
