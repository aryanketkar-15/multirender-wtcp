<?php

declare(strict_types=1);

namespace Mra\Config;

final class DatabaseConfig
{
    /**
     * @return array{host:string,port:int,name:string,user:string,pass:string}
     */
    public static function fromEnv(bool $test = false): array
    {
        return [
            'host' => Env::get('DB_HOST', '127.0.0.1') ?? '127.0.0.1',
            'port' => (int) (Env::get('DB_PORT', '3306') ?? '3306'),
            'name' => $test
                ? (Env::get('DB_TEST_NAME', 'mra_test') ?? 'mra_test')
                : Env::require('DB_NAME'),
            'user' => Env::require('DB_USER'),
            'pass' => Env::get('DB_PASS', '') ?? '',
        ];
    }
}
