<?php

declare(strict_types=1);

namespace Mra\Tests\Service;

use Mra\App;
use Mra\Http\Kernel;
use Mra\Http\Response;
use Mra\Service\SessionService;
use Mra\Tests\TestCase;

final class PasswordResetTest extends TestCase
{
    private const NEW_PASSWORD = 'brand new password 42';

    private App $app;
    private Kernel $kernel;
    private int $userId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->app = $this->makeApp();
        $this->kernel = new Kernel($this->app);
        $this->userId = $this->app->users->create('reset@example.com', 'Reset Me', password_hash('old password 1234', PASSWORD_BCRYPT));
        $this->app->users->markVerified($this->userId);
    }

    private function forgot(string $email = 'reset@example.com', string $ip = '198.51.100.41'): Response
    {
        return $this->call($this->kernel, 'POST', '/api/password/forgot', ['email' => $email], $ip);
    }

    /** @param array<string,mixed> $extra */
    private function reset(string $token, string $pw = self::NEW_PASSWORD, ?string $confirm = null, array $extra = []): Response
    {
        return $this->call($this->kernel, 'POST', '/api/password/reset', [
            'token' => $token,
            'password' => $pw,
            'password_confirm' => $confirm ?? $pw,
        ] + $extra);
    }

    private function tokenFromMail(): string
    {
        $last = end($this->mailer->sent);
        $this->assertNotFalse($last, 'a reset mail was sent');
        $this->assertSame(1, preg_match('/token=([a-f0-9]{64})/', $last['body'], $m));
        return $m[1];
    }

    public function testResetTokenIsSingleUse(): void // T1.5.5
    {
        $this->forgot();
        $token = $this->tokenFromMail();
        $this->assertSame(200, $this->reset($token)->status);
        $second = $this->reset($token, 'another password 77');
        $this->assertSame(422, $second->status);
        $this->assertSame('This reset link is invalid or has expired.', $second->data()['message']);
        $hash = $this->app->users->findById($this->userId)->passwordHash;
        $this->assertTrue(password_verify(self::NEW_PASSWORD, $hash), 'the second attempt changed nothing');
    }

    public function testResetTokenExpiresAfterFifteenMinutes(): void // T1.5.6
    {
        $this->forgot();
        $token = $this->tokenFromMail();
        $this->clock->advance('+16 minutes');
        $this->assertSame(422, $this->reset($token)->status);
    }

    public function testResetTokenStillWorksJustBeforeExpiry(): void
    {
        $this->forgot();
        $token = $this->tokenFromMail();
        $this->clock->advance('+14 minutes 59 seconds');
        $this->assertSame(200, $this->reset($token)->status);
    }

    public function testCompletingAResetRevokesEverySession(): void // T1.5.7
    {
        $a = $this->app->sessions->create($this->userId);
        $b = $this->app->sessions->create($this->userId);
        $this->forgot();
        $this->assertSame(200, $this->reset($this->tokenFromMail())->status);
        foreach ([$a, $b] as $s) {
            $res = $this->call($this->kernel, 'GET', '/api/session', [], '198.51.100.41', [], [SessionService::COOKIE => $s['token']]);
            $this->assertFalse($res->data()['authenticated']);
        }
    }

    public function testMismatchedNewPasswordsAreRejectedWithoutSpendingTheToken(): void // T1.5.8
    {
        $this->forgot();
        $token = $this->tokenFromMail();
        $bad = $this->reset($token, self::NEW_PASSWORD, 'does not match 99');
        $this->assertSame(422, $bad->status);
        $this->assertSame('Passwords do not match', $bad->data()['fields']['password_confirm']);
        $this->assertSame(200, $this->reset($token)->status, 'the link survives a typo');
    }

    public function testWeakNewPasswordIsRejected(): void
    {
        $this->forgot();
        $res = $this->reset($this->tokenFromMail(), 'short1');
        $this->assertSame(422, $res->status);
        $this->assertArrayHasKey('password', $res->data()['fields']);
    }

    public function testForgotIsIndistinguishableForUnknownAddresses(): void // T1.5.9
    {
        $known = $this->forgot('reset@example.com', '198.51.100.42');
        $unknown = $this->forgot('ghost@example.com', '198.51.100.43');
        $this->assertSame($known->status, $unknown->status);
        $this->assertSame($known->body, $unknown->body);
        $this->assertSame($known->headers, $unknown->headers);
        $this->assertCount(1, $this->mailer->sent);
    }

    public function testTokenIsStoredOnlyAsAHash(): void
    {
        $this->forgot();
        $token = $this->tokenFromMail();
        $stored = $this->pdo->query('SELECT token_hash FROM password_reset')->fetchColumn();
        $this->assertNotSame($token, $stored);
        $this->assertSame(hash('sha256', $token), $stored);
    }

    public function testTokensAre32BytesOfRandomnessAndNeverRepeat(): void
    {
        $seen = [];
        for ($i = 0; $i < 20; $i++) {
            $this->app->throttle->clear('reset_request', 'reset@example.com');
            $this->forgot();
            $seen[$this->tokenFromMail()] = true;
        }
        $this->assertCount(20, $seen);
    }

    public function testANewRequestRetiresTheOldLink(): void
    {
        $this->forgot();
        $old = $this->tokenFromMail();
        $this->forgot();
        $new = $this->tokenFromMail();
        $this->assertNotSame($old, $new);
        $this->assertSame(422, $this->reset($old)->status);
        $this->assertSame(200, $this->reset($new)->status);
    }

    public function testMalformedAndUnknownTokensAreRejectedIdentically(): void
    {
        $a = $this->reset('not-a-token');
        $b = $this->reset(str_repeat('a', 64));
        $this->assertSame(422, $a->status);
        $this->assertSame($a->body, $b->body);
        $this->assertGreaterThanOrEqual(2, (int) $this->pdo->query(
            "SELECT COUNT(*) FROM security_log WHERE event_type = 'password_reset.invalid_token'"
        )->fetchColumn());
    }

    public function testForgotIsRateLimited(): void
    {
        for ($i = 0; $i < 3; $i++) {
            $this->assertSame(202, $this->forgot()->status);
        }
        $this->assertSame(429, $this->forgot()->status);
    }

    public function testNewPasswordWorksForLoginAndOldOneDoesNot(): void
    {
        $this->forgot();
        $this->reset($this->tokenFromMail());
        $hash = $this->app->users->findById($this->userId)->passwordHash;
        $this->assertStringStartsWith('$argon2id$', $hash);
        $this->assertTrue(password_verify(self::NEW_PASSWORD, $hash));
        $this->assertFalse(password_verify('old password 1234', $hash));
    }

    public function testPasswordsNeverReachTheLogs(): void
    {
        $this->forgot();
        $this->reset($this->tokenFromMail());
        foreach (['audit_log', 'security_log'] as $table) {
            $dump = json_encode($this->pdo->query("SELECT * FROM {$table}")->fetchAll(), JSON_INVALID_UTF8_SUBSTITUTE);
            $this->assertStringNotContainsString('brand new', (string) $dump);
            $this->assertStringNotContainsString($this->tokenFromMail(), (string) $dump);
        }
    }

    public function testResetAlsoLiftsTheLoginBackoffForThatAccount(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->app->throttle->record('login_account', 'reset@example.com');
        }
        $this->forgot();
        $this->reset($this->tokenFromMail());
        $this->assertSame(0, $this->app->throttle->count('login_account', 'reset@example.com', 3600));
    }
}
