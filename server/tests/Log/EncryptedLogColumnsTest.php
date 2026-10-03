<?php

declare(strict_types=1);

namespace Mra\Tests\Log;

use Mra\Crypto\FieldCipher;
use Mra\Log\AuditLogger;
use Mra\Log\SecurityLogger;
use Mra\Tests\TestCase;

/** Milestone 1.1 retrofit: IP and user agent are ciphertext at rest in both operational logs. */
final class EncryptedLogColumnsTest extends TestCase
{
    public function testAuditIpAndUserAgentAreEncrypted(): void
    {
        $cipher = new FieldCipher(str_repeat("\x55", 32));
        $id = (new AuditLogger($this->pdo, $cipher))->record(
            'user.login',
            'success',
            1,
            null,
            null,
            [],
            '203.0.113.9',
            'Mozilla/5.0 TestAgent'
        );
        $row = $this->pdo->query("SELECT ip_enc, ua_enc FROM audit_log WHERE id = {$id}")->fetch();
        $this->assertStringNotContainsString('203.0.113.9', $row['ip_enc']);
        $this->assertStringNotContainsString('TestAgent', $row['ua_enc']);
        $this->assertSame('203.0.113.9', $cipher->decrypt($row['ip_enc'], 'audit_log.ip_enc'));
        $this->assertSame('Mozilla/5.0 TestAgent', $cipher->decrypt($row['ua_enc'], 'audit_log.ua_enc'));
    }

    public function testSecurityIpIsEncrypted(): void
    {
        $cipher = new FieldCipher(str_repeat("\x55", 32));
        $logger = new SecurityLogger($this->pdo, $cipher);
        $id = $logger->record('auth.login_failed', 'warning', null, [], '198.51.100.7');
        $ip = $this->pdo->query("SELECT ip_enc FROM security_log WHERE id = {$id}")->fetchColumn();
        $this->assertStringNotContainsString('198.51.100.7', $ip);
        $this->assertSame('198.51.100.7', $cipher->decrypt($ip, 'security_log.ip_enc'));
    }
}
