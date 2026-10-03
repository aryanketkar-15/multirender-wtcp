<?php

declare(strict_types=1);

namespace Mra\Tests;

use Mra\App;
use Mra\Config\DatabaseConfig;
use Mra\Crypto\BlindIndex;
use Mra\Crypto\FieldCipher;
use Mra\Http\Kernel;
use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Repository\Database;
use Mra\Tests\Support\FakeClock;
use Mra\Tests\Support\FakeMailer;
use PDO;
use PHPUnit\Framework\TestCase as BaseTestCase;

/**
 * Base for every database test. Each test runs inside a transaction that is rolled back in
 * tearDown(), giving isolation without rebuilding the schema between tests.
 */
abstract class TestCase extends BaseTestCase
{
    protected PDO $pdo;
    protected FakeClock $clock;
    protected FakeMailer $mailer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->pdo = Database::connection(DatabaseConfig::fromEnv(true));
        $this->pdo->beginTransaction();
        $this->clock = new FakeClock();
        $this->mailer = new FakeMailer();
    }

    protected function tearDown(): void
    {
        if ($this->pdo->inTransaction()) {
            $this->pdo->rollBack();
        }
        parent::tearDown();
    }

    /** An application wired with throwaway keys and the fake clock, on the transactional connection. */
    protected function makeApp(): App
    {
        return new App(
            $this->pdo,
            new FieldCipher(str_repeat("\x61", 32)),
            new BlindIndex(str_repeat("\x62", 32)),
            $this->clock,
            $this->mailer
        );
    }

    /**
     * @param array<string,mixed> $body
     * @param array<string,string> $headers
     * @param array<string,string> $cookies
     */
    protected function call(
        Kernel $kernel,
        string $method,
        string $path,
        array $body = [],
        string $ip = '198.51.100.1',
        array $headers = [],
        array $cookies = []
    ): Response {
        return $kernel->handle(new Request($method, $path, $body, $headers, $cookies, $ip, 'PHPUnit'));
    }
}
