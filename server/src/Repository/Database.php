<?php

declare(strict_types=1);

namespace Mra\Repository;

use Mra\Config\DatabaseConfig;
use PDO;
use PDOException;

final class Database
{
    /** @var array<string,PDO> */
    private static array $pool = [];

    /**
     * @param array{host:string,port:int,name:string,user:string,pass:string}|null $config
     */
    public static function connection(?array $config = null): PDO
    {
        $config ??= DatabaseConfig::fromEnv();
        $key = $config['host'] . ':' . $config['port'] . '/' . $config['name'] . '@' . $config['user'];
        return self::$pool[$key] ??= self::connect($config);
    }

    public static function reset(): void
    {
        self::$pool = [];
    }

    /**
     * @param array{host:string,port:int,name:string,user:string,pass:string} $config
     */
    private static function connect(array $config): PDO
    {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $config['host'],
            $config['port'],
            $config['name']
        );
        try {
            return new PDO($dsn, $config['user'], $config['pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                // Server-side prepares: with emulation on, PDO interpolates client-side
                // and injection protection is weaker than it appears.
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
            ]);
        } catch (PDOException $e) {
            // Deliberately not chained: the driver message can echo the user name and host.
            throw new DatabaseException('Database connection failed (code ' . (int) $e->getCode() . ').');
        }
    }
}
