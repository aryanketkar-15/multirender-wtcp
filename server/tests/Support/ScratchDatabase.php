<?php

declare(strict_types=1);

namespace Mra\Tests\Support;

use Mra\Config\DatabaseConfig;
use Mra\Migration\Migrator;
use Mra\Repository\Database;
use PDO;

/**
 * A throwaway, fully migrated database for tests that need real commits (concurrency, scale, grants)
 * and must not disturb the transactional test schema.
 */
final class ScratchDatabase
{
    /** @return array{host:string,port:int,name:string,user:string,pass:string} */
    public static function create(string $name, bool $migrate = true): array
    {
        $admin = Database::connection(DatabaseConfig::fromEnv(true));
        $admin->exec('DROP DATABASE IF EXISTS `' . $name . '`');
        $admin->exec('CREATE DATABASE `' . $name . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $config = DatabaseConfig::fromEnv(true);
        $config['name'] = $name;
        if ($migrate) {
            (new Migrator(Database::connection($config), dirname(__DIR__, 2) . '/migrations'))->up();
        }
        return $config;
    }

    public static function drop(string $name): void
    {
        Database::reset();
        Database::connection(DatabaseConfig::fromEnv(true))->exec('DROP DATABASE IF EXISTS `' . $name . '`');
    }

    /** @param array{host:string,port:int,name:string,user:string,pass:string} $config */
    public static function pdo(array $config): PDO
    {
        return Database::connection($config);
    }
}
