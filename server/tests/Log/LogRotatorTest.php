<?php

declare(strict_types=1);

namespace Mra\Tests\Log;

use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;
use Mra\Config\DatabaseConfig;
use Mra\Log\LogRotator;
use Mra\Repository\Database;
use PDO;
use PHPUnit\Framework\TestCase;

/** Rotation issues DDL, which commits implicitly, so these tests clean up after themselves. */
final class LogRotatorTest extends TestCase
{
    private PDO $pdo;
    private DateTimeImmutable $now;

    protected function setUp(): void
    {
        $this->pdo = Database::connection(DatabaseConfig::fromEnv(true));
        $this->now = new DateTimeImmutable('2026-10-03 12:00:00', new DateTimeZone('UTC'));
        $this->clean();
    }

    protected function tearDown(): void
    {
        $this->clean();
    }

    private function clean(): void
    {
        foreach (['audit_log', 'security_log'] as $table) {
            $this->pdo->exec("DELETE FROM {$table}");
            $this->pdo->exec("DROP TABLE IF EXISTS {$table}_archive_20261003");
        }
    }

    private function seedDays(string $table, int $days): void
    {
        $col = $table === 'audit_log' ? 'action, outcome' : 'event_type, severity';
        $ins = $this->pdo->prepare("INSERT INTO {$table} ({$col}, created_at) VALUES (?, ?, ?)");
        for ($d = 0; $d < $days; $d++) {
            $at = $this->now->modify("-{$d} days")->format('Y-m-d H:i:s.u');
            $ins->execute(['seed', $table === 'audit_log' ? 'success' : 'info', $at]);
        }
    }

    public function testRowsPastRetentionAreArchivedAndRecentRowsUntouched(): void // T0.3.7
    {
        $this->seedDays('audit_log', 200);
        $result = (new LogRotator($this->pdo, 90, 1_000_000))->rotate('audit_log', $this->now);

        // Rows aged 0..90 days survive (cutoff is strictly older than 90 days); 91..199 move.
        $this->assertSame(109, $result['archived']);
        $this->assertSame(91, $result['live_after']);
        $this->assertTrue($result['reconciled']);
        $this->assertSame(200, $result['before']);
        $oldest = $this->pdo->query('SELECT MIN(created_at) FROM audit_log')->fetchColumn();
        $floor = $this->now->modify('-90 days')->format('Y-m-d');
        $this->assertGreaterThanOrEqual($floor, substr((string) $oldest, 0, 10));
    }

    public function testRowCountsReconcileAcrossLiveAndArchive(): void
    {
        $this->seedDays('security_log', 150);
        $r = (new LogRotator($this->pdo, 30, 1_000_000))->rotate('security_log', $this->now);
        $archived = (int) $this->pdo->query("SELECT COUNT(*) FROM {$r['archive']}")->fetchColumn();
        $this->assertSame(150, $r['live_after'] + $archived);
    }

    public function testRotationIsSafeToRunTwice(): void
    {
        $this->seedDays('audit_log', 120);
        $rotator = new LogRotator($this->pdo, 60, 1_000_000);
        $rotator->rotate('audit_log', $this->now);
        $second = $rotator->rotate('audit_log', $this->now);
        $this->assertSame(0, $second['archived']);
        $this->assertTrue($second['reconciled']);
    }

    public function testSizeCapIsFlagged(): void
    {
        $this->seedDays('audit_log', 20);
        $r = (new LogRotator($this->pdo, 90, 10))->rotate('audit_log', $this->now);
        $this->assertTrue($r['over_cap']);
    }

    public function testUnknownTableIsRefused(): void
    {
        $this->expectException(InvalidArgumentException::class);
        (new LogRotator($this->pdo, 90, 10))->rotate('users', $this->now);
    }
}
