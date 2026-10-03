<?php

declare(strict_types=1);

namespace Mra\Tests\Migration;

use Mra\Config\DatabaseConfig;
use Mra\Migration\Migrator;
use Mra\Repository\Database;
use PDO;
use PHPUnit\Framework\TestCase;

/** Uses its own scratch database so DDL never disturbs the transactional test schema. */
final class MigratorTest extends TestCase
{
    private const SCRATCH = 'mra_migrate_test';

    private PDO $pdo;
    private Migrator $migrator;

    protected function setUp(): void
    {
        $admin = Database::connection(DatabaseConfig::fromEnv(true));
        $admin->exec('DROP DATABASE IF EXISTS ' . self::SCRATCH);
        $admin->exec('CREATE DATABASE ' . self::SCRATCH . ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $config = DatabaseConfig::fromEnv(true);
        $config['name'] = self::SCRATCH;
        $this->pdo = Database::connection($config);
        $this->migrator = new Migrator($this->pdo, dirname(__DIR__, 2) . '/migrations');
    }

    protected function tearDown(): void
    {
        Database::reset();
        Database::connection(DatabaseConfig::fromEnv(true))->exec('DROP DATABASE IF EXISTS ' . self::SCRATCH);
    }

    private function expectedCount(): int
    {
        return count(glob(dirname(__DIR__, 2) . '/migrations/*.up.sql') ?: []);
    }

    public function testUpCreatesTrackingTableAndRecordsEveryMigration(): void // T0.2.3
    {
        $this->migrator->up();
        $this->assertSame($this->expectedCount(), count($this->migrator->applied()));
        $this->assertArrayHasKey('001', $this->migrator->applied());
    }

    public function testUpIsIdempotent(): void // T0.2.4
    {
        $this->migrator->up();
        $this->assertSame([], $this->migrator->up());
        $rows = (int) $this->pdo->query('SELECT COUNT(*) FROM schema_migrations')->fetchColumn();
        $this->assertSame($this->expectedCount(), $rows);
    }

    public function testDownAllRemovesTheSchema(): void // T0.2.5
    {
        $this->migrator->up();
        $this->migrator->down(PHP_INT_MAX);
        $tables = $this->pdo->query(
            'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()'
        )->fetchColumn();
        $this->assertSame(0, (int) $tables);
        $this->assertSame([], $this->migrator->applied());
    }

    public function testUpDownUpLeavesACorrectSchema(): void
    {
        $this->migrator->up();
        $this->migrator->down(PHP_INT_MAX);
        $this->migrator->up();
        $this->assertSame($this->expectedCount(), count($this->migrator->applied()));
    }
}
