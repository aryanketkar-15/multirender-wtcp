<?php

declare(strict_types=1);

namespace Mra\Tests\Repository;

use InvalidArgumentException;
use Mra\Config\DatabaseConfig;
use Mra\Repository\BaseRepository;
use Mra\Repository\Database;
use Mra\Repository\DatabaseException;
use Mra\Tests\TestCase;
use PDO;
use PDOException;
use PDOStatement;

final class DatabaseTest extends TestCase
{
    public function testConnectionSucceeds(): void // T0.2.1
    {
        $pdo = Database::connection(DatabaseConfig::fromEnv(true));
        $this->assertInstanceOf(PDO::class, $pdo);
        $this->assertSame(1, (int) $pdo->query('SELECT 1')->fetchColumn());
    }

    public function testConnectionIsConfiguredSafely(): void
    {
        $this->assertSame(PDO::ERRMODE_EXCEPTION, $this->pdo->getAttribute(PDO::ATTR_ERRMODE));
        $this->assertSame(PDO::FETCH_ASSOC, $this->pdo->getAttribute(PDO::ATTR_DEFAULT_FETCH_MODE));
        $this->assertFalse((bool) $this->pdo->getAttribute(PDO::ATTR_EMULATE_PREPARES));
    }

    public function testBadCredentialsFailSafely(): void // T0.2.2
    {
        $config = DatabaseConfig::fromEnv(true);
        $config['pass'] = 'definitely-wrong-secret-9137';
        $config['user'] = 'nobody_such_user';
        try {
            Database::connection($config);
            $this->fail('Expected a connection failure');
        } catch (PDOException $e) {
            $this->assertInstanceOf(DatabaseException::class, $e);
            $this->assertStringNotContainsString('definitely-wrong-secret-9137', $e->getMessage());
            $this->assertStringNotContainsString('nobody_such_user', $e->getMessage());
            $this->assertNull($e->getPrevious());
        }
    }

    public function testRowInsertedInOneTestIsGoneInTheNext(): void // T0.2.6 (part 1)
    {
        $this->pdo->prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
            ->execute(['999', 'isolation_probe']);
        $this->assertSame(1, $this->count999());
    }

    public function testRowFromPreviousTestIsAbsent(): void // T0.2.6 (part 2)
    {
        $this->assertSame(0, $this->count999());
    }

    public function testParameterIsTreatedAsLiteral(): void // T0.2.7
    {
        $repo = $this->repository();
        $hostile = "'; DROP TABLE schema_migrations--";
        $stmt = $repo->query('SELECT COUNT(*) FROM schema_migrations WHERE name = ?', [$hostile]);
        $this->assertSame(0, (int) $stmt->fetchColumn());
        $remaining = (int) $this->pdo->query('SELECT COUNT(*) FROM schema_migrations')->fetchColumn();
        $this->assertGreaterThanOrEqual(1, $remaining);
    }

    public function testQuotedLiteralsInSqlAreRefused(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->repository()->query("SELECT COUNT(*) FROM schema_migrations WHERE name = 'x'");
    }

    private function count999(): int
    {
        return (int) $this->pdo->query('SELECT COUNT(*) FROM schema_migrations WHERE version = ' . (int) 999)
            ->fetchColumn();
    }

    private function repository(): object
    {
        return new class ($this->pdo) extends BaseRepository {
            /** @param array<int,mixed> $params */
            public function query(string $sql, array $params = []): PDOStatement
            {
                return $this->run($sql, $params);
            }
        };
    }
}
