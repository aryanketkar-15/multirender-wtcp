<?php

declare(strict_types=1);

namespace Mra\Tests;

use Mra\Config\DatabaseConfig;
use Mra\Repository\Database;
use PDO;
use PHPUnit\Framework\TestCase as BaseTestCase;

/**
 * Base for every database test. Each test runs inside a transaction that is rolled back in
 * tearDown(), giving isolation without rebuilding the schema between tests.
 */
abstract class TestCase extends BaseTestCase
{
    protected PDO $pdo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->pdo = Database::connection(DatabaseConfig::fromEnv(true));
        $this->pdo->beginTransaction();
    }

    protected function tearDown(): void
    {
        if ($this->pdo->inTransaction()) {
            $this->pdo->rollBack();
        }
        parent::tearDown();
    }
}
