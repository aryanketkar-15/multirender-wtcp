<?php

declare(strict_types=1);

namespace Mra\Tests\Log;

use InvalidArgumentException;
use Mra\Log\AuditLogger;
use Mra\Log\LogWriteException;
use Mra\Log\SecurityLogger;
use Mra\Tests\Support\BrokenPdo;
use Mra\Tests\TestCase;
use ReflectionClass;

final class LoggerTest extends TestCase
{
    /** @return array<string,mixed> */
    private function row(string $table, int $id): array
    {
        $stmt = $this->pdo->prepare("SELECT * FROM {$table} WHERE id = ?");
        $stmt->execute([$id]);
        return $stmt->fetch() ?: [];
    }

    public function testAuditEntryIsWrittenWithActorAndOutcome(): void // T0.3.1
    {
        $id = (new AuditLogger($this->pdo))->record('user.login', 'success', 42, 'user', '42');
        $row = $this->row('audit_log', $id);
        $this->assertSame('user.login', $row['action']);
        $this->assertSame(42, (int) $row['actor_id']);
        $this->assertSame('success', $row['outcome']);
    }

    public function testPasswordNeverReachesTheTable(): void // T0.3.2 via the database
    {
        $id = (new AuditLogger($this->pdo))->record(
            'user.register',
            'success',
            null,
            null,
            null,
            ['email_domain' => 'b.com', 'password' => 'hunter2-plaintext']
        );
        $row = $this->row('audit_log', $id);
        $this->assertStringContainsString('[redacted]', (string) $row['detail']);
        $this->assertStringNotContainsString('hunter2-plaintext', (string) $row['detail']);
    }

    public function testSecurityEventLandsInItsOwnTableWithSeverity(): void // T0.3.5
    {
        $before = (int) $this->pdo->query('SELECT COUNT(*) FROM audit_log')->fetchColumn();
        $id = (new SecurityLogger($this->pdo))->record('auth.login_failed', 'warning', 7, ['otp' => '111111']);
        $row = $this->row('security_log', $id);
        $this->assertSame('warning', $row['severity']);
        $this->assertSame('auth.login_failed', $row['event_type']);
        $this->assertStringNotContainsString('111111', (string) $row['detail']);
        $this->assertSame($before, (int) $this->pdo->query('SELECT COUNT(*) FROM audit_log')->fetchColumn());
    }

    public function testIpAndUserAgentAreStoredNullUntilEncryptionIsConfigured(): void
    {
        $id = (new AuditLogger($this->pdo))->record(
            'user.login',
            'success',
            1,
            null,
            null,
            [],
            '203.0.113.9',
            'Mozilla/5.0'
        );
        $row = $this->row('audit_log', $id);
        $this->assertNull($row['ip_enc']);
        $this->assertNull($row['ua_enc']);
    }

    public function testUnknownOutcomeAndSeverityAreRejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        (new AuditLogger($this->pdo))->record('x', 'maybe');
    }

    public function testUnknownSeverityIsRejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        (new SecurityLogger($this->pdo))->record('x', 'catastrophic');
    }

    public function testWriteFailureSurfacesInsteadOfBeingSwallowed(): void // T0.3.6
    {
        $broken = (new ReflectionClass(BrokenPdo::class))->newInstanceWithoutConstructor();
        $this->expectException(LogWriteException::class);
        (new AuditLogger($broken))->record('user.login');
    }

    public function testSecurityWriteFailureSurfaces(): void
    {
        $broken = (new ReflectionClass(BrokenPdo::class))->newInstanceWithoutConstructor();
        $this->expectException(LogWriteException::class);
        (new SecurityLogger($broken))->record('auth.login_failed');
    }
}
