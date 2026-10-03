<?php

declare(strict_types=1);

namespace Mra\Tests\Repository;

use Mra\Config\DatabaseConfig;
use Mra\Config\Env;
use Mra\Repository\GrantPolicy;
use Mra\Tests\Support\ScratchDatabase;
use PDO;
use PDOException;
use PHPUnit\Framework\TestCase;

/**
 * T4.4.8 and T4.4.9: append-only is enforced by the database, not by application code. A real
 * restricted account is created, the grant policy is applied to it, and the account is then used to
 * attempt exactly the statements an SQL injection would try. Needs an administrative database
 * account (DB_ADMIN_USER / DB_ADMIN_PASS); skipped without one.
 */
final class GrantPolicyTest extends TestCase
{
    private const DB = 'mra_scratch_grants';
    private const USER = 'mra_probe';
    private const PASS = 'probe-Pass-9137-xyz';

    private PDO $admin;
    private PDO $app;

    protected function setUp(): void
    {
        $adminUser = Env::get('DB_ADMIN_USER');
        if ($adminUser === null) {
            $this->markTestSkipped('DB_ADMIN_USER is not configured');
        }
        $config = DatabaseConfig::fromEnv(true);
        try {
            $this->admin = new PDO(
                sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $config['host'], $config['port']),
                $adminUser,
                Env::get('DB_ADMIN_PASS', '') ?? '',
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
            );
        } catch (PDOException) {
            $this->markTestSkipped('the administrative database account cannot connect');
        }
        ScratchDatabase::create(self::DB);
        $this->admin->exec('DROP DATABASE IF EXISTS `' . self::DB . '`');
        $this->admin->exec('CREATE DATABASE `' . self::DB . '` CHARACTER SET utf8mb4');
        $scratch = $config;
        $scratch['name'] = self::DB;
        (new \Mra\Migration\Migrator(
            new PDO(
                sprintf('mysql:host=%s;port=%d;dbname=%s', $config['host'], $config['port'], self::DB),
                $adminUser,
                Env::get('DB_ADMIN_PASS', '') ?? '',
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
            ),
            dirname(__DIR__, 2) . '/migrations'
        ))->up();

        foreach (['localhost', '%'] as $host) {
            $this->admin->exec("DROP USER IF EXISTS '" . self::USER . "'@'{$host}'");
            $this->admin->exec("CREATE USER '" . self::USER . "'@'{$host}' IDENTIFIED BY '" . self::PASS . "'");
            GrantPolicy::apply($this->admin, self::DB, self::USER, $host);
        }
        $this->app = new PDO(
            sprintf('mysql:host=%s;port=%d;dbname=%s', $config['host'], $config['port'], self::DB),
            self::USER,
            self::PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
    }

    protected function tearDown(): void
    {
        if (isset($this->admin)) {
            foreach (['localhost', '%'] as $host) {
                $this->admin->exec("DROP USER IF EXISTS '" . self::USER . "'@'{$host}'");
            }
            $this->admin->exec('DROP DATABASE IF EXISTS `' . self::DB . '`');
        }
    }

    private function assertDenied(string $sql, string $why): void
    {
        try {
            $this->app->exec($sql);
            $this->fail("Expected the database to refuse: {$why}");
        } catch (PDOException $e) {
            $this->assertSame('42000', $e->getCode(), $why . ': ' . $e->getMessage());
            $this->assertStringContainsString('denied', strtolower($e->getMessage()), $why);
        }
    }

    public function testTheAppAccountMayInsertAndReadLeaves(): void
    {
        $this->app->exec("INSERT INTO mra_leaf (idx, leaf_hash, kind, ref_hash, record_json) VALUES (0, UNHEX('" . str_repeat('11', 32) . "'), 'test', 'ref', '{}')");
        $this->assertSame(1, (int) $this->app->query('SELECT COUNT(*) FROM mra_leaf')->fetchColumn());
        $this->app->exec("INSERT INTO mra_node (level, idx, hash) VALUES (0, 0, UNHEX('" . str_repeat('11', 32) . "'))");
        $this->assertSame(1, (int) $this->app->query('SELECT COUNT(*) FROM mra_node')->fetchColumn());
    }

    public function testUpdateOnTheLeafTableIsDeniedByTheDatabase(): void // T4.4.8
    {
        $this->assertDenied("UPDATE mra_leaf SET record_json = '{}'", 'UPDATE mra_leaf');
    }

    public function testDeleteOnTheLeafTableIsDeniedByTheDatabase(): void // T4.4.9
    {
        $this->assertDenied('DELETE FROM mra_leaf', 'DELETE FROM mra_leaf');
    }

    /** @return array<string,array{string}> */
    public static function evidenceTables(): array
    {
        $tables = array_diff(GrantPolicy::APPEND_ONLY, []);
        return array_combine($tables, array_map(static fn (string $t): array => [$t], $tables));
    }

    /** @dataProvider evidenceTables */
    public function testEveryEvidenceTableRefusesUpdateDeleteTruncateAndDrop(string $table): void
    {
        $this->assertDenied("DELETE FROM {$table}", "DELETE {$table}");
        $this->assertDenied("TRUNCATE TABLE {$table}", "TRUNCATE {$table}");
        $this->assertDenied("DROP TABLE {$table}", "DROP {$table}");
        $this->assertDenied("ALTER TABLE {$table} ADD COLUMN injected INT", "ALTER {$table}");
        $column = (string) $this->admin->query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = '" . self::DB
            . "' AND table_name = '{$table}' AND column_key <> 'PRI' LIMIT 1"
        )->fetchColumn();
        $this->assertDenied("UPDATE {$table} SET {$column} = {$column}", "UPDATE {$table}");
    }

    public function testOperationalLogsAreInsertOnly(): void
    {
        $this->app->exec("INSERT INTO audit_log (action, outcome) VALUES ('t', 'success')");
        $this->assertDenied('SELECT * FROM audit_log', 'SELECT audit_log');
        $this->assertDenied('DELETE FROM audit_log', 'DELETE audit_log');
        $this->assertDenied("UPDATE security_log SET severity = 'info'", 'UPDATE security_log');
    }

    public function testOrdinaryWorkingTablesStillAllowTheWritesTheApplicationNeeds(): void
    {
        $this->app->exec("INSERT INTO throttle_event (bucket, subject, created_at) VALUES ('b', UNHEX('" . str_repeat('22', 32) . "'), NOW())");
        $this->app->exec("UPDATE throttle_event SET bucket = 'c'");
        $this->app->exec('DELETE FROM throttle_event');
        $this->assertSame(0, (int) $this->app->query('SELECT COUNT(*) FROM throttle_event')->fetchColumn());
    }

    public function testThePolicyDescribesEveryTable(): void
    {
        $this->assertSame('SELECT, INSERT', GrantPolicy::privilegesFor('mra_leaf'));
        $this->assertSame('INSERT', GrantPolicy::privilegesFor('audit_log'));
        $this->assertSame('INSERT', GrantPolicy::privilegesFor('audit_log_archive_20261003'));
        $this->assertSame('SELECT, INSERT, UPDATE, DELETE', GrantPolicy::privilegesFor('sessions'));
    }
}
