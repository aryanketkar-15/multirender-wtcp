<?php

declare(strict_types=1);

namespace Mra;

use Mra\Config\DatabaseConfig;
use Mra\Config\Env;
use Mra\Crypto\BlindIndex;
use Mra\Crypto\CryptoFactory;
use Mra\Crypto\FieldEncryptor;
use Mra\Log\AuditLogger;
use Mra\Log\SecurityLogger;
use Mra\Repository\Database;
use Mra\Repository\UserRepository;
use Mra\Service\ThrottleService;
use Mra\Support\Clock;
use Mra\Support\SystemClock;
use PDO;

/** Wiring: the one place that knows how the services fit together. */
final class App
{
    public readonly UserRepository $users;
    public readonly AuditLogger $audit;
    public readonly SecurityLogger $security;
    public readonly ThrottleService $throttle;

    public function __construct(
        public readonly PDO $pdo,
        public readonly FieldEncryptor $cipher,
        public readonly BlindIndex $index,
        public readonly Clock $clock
    ) {
        $this->users = new UserRepository($pdo, $cipher, $index);
        $this->audit = new AuditLogger($pdo, $cipher);
        $this->security = new SecurityLogger($pdo, $cipher);
        $this->throttle = new ThrottleService($pdo, $index, $clock);
    }

    public static function fromEnv(): self
    {
        $crypto = CryptoFactory::fromConfig();
        return new self(
            Database::connection(DatabaseConfig::fromEnv(Env::get('APP_ENV') === 'test')),
            $crypto['cipher'],
            $crypto['index'],
            new SystemClock()
        );
    }
}
