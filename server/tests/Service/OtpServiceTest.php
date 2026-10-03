<?php

declare(strict_types=1);

namespace Mra\Tests\Service;

use Mra\App;
use Mra\Http\Kernel;
use Mra\Tests\TestCase;

final class OtpServiceTest extends TestCase
{
    private App $app;
    private Kernel $kernel;
    private int $userId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->app = $this->makeApp();
        $this->kernel = new Kernel($this->app);
        $this->userId = $this->app->users->create('otp@example.com', 'Otp User', password_hash('x', PASSWORD_BCRYPT));
    }

    private function requestCode(string $email = 'otp@example.com', string $ip = '198.51.100.20'): \Mra\Http\Response
    {
        return $this->call($this->kernel, 'POST', '/api/otp/request', ['email' => $email], $ip);
    }

    private function verify(string $code, string $email = 'otp@example.com'): \Mra\Http\Response
    {
        return $this->call($this->kernel, 'POST', '/api/otp/verify', ['email' => $email, 'code' => $code]);
    }

    private function wrongCode(string $real): string
    {
        return $real === '000000' ? '000001' : '000000';
    }

    private function otpRow(): array|false
    {
        return $this->pdo->query("SELECT * FROM user_otp WHERE user_id = {$this->userId}")->fetch();
    }

    public function testOtpIsIssuedAndEmailed(): void // T1.3.1
    {
        $res = $this->requestCode();
        $this->assertSame(202, $res->status);
        $this->assertCount(1, $this->mailer->sent);
        $this->assertSame('otp@example.com', $this->mailer->sent[0]['to']);
        $this->assertMatchesRegularExpression('/^\d{6}$/', (string) $this->mailer->lastCode());
        $this->assertNotFalse($this->otpRow());
    }

    public function testCorrectCodeVerifiesAndDeletesTheRow(): void // T1.3.2
    {
        $this->requestCode();
        $res = $this->verify((string) $this->mailer->lastCode());
        $this->assertSame(200, $res->status);
        $this->assertTrue($this->app->users->findById($this->userId)->isVerified());
        $this->assertFalse($this->otpRow());
    }

    public function testWrongCodeIsRejectedAndCountsAnAttempt(): void // T1.3.3
    {
        $this->requestCode();
        $res = $this->verify($this->wrongCode((string) $this->mailer->lastCode()));
        $this->assertSame(422, $res->status);
        $this->assertSame(1, (int) $this->otpRow()['attempts']);
        $this->assertFalse($this->app->users->findById($this->userId)->isVerified());
    }

    public function testExpiredCodeIsRejectedWithTheGenericMessage(): void // T1.3.4
    {
        $this->requestCode();
        $code = (string) $this->mailer->lastCode();
        $this->clock->advance('+11 minutes');
        $res = $this->verify($code);
        $this->assertSame(422, $res->status);
        $this->assertSame('That code is incorrect or has expired', $res->data()['message']);
    }

    public function testCodeIsStillValidJustBeforeExpiry(): void
    {
        $this->requestCode();
        $code = (string) $this->mailer->lastCode();
        $this->clock->advance('+9 minutes 59 seconds');
        $this->assertSame(200, $this->verify($code)->status);
    }

    public function testAttemptLimitLocksTheCodeEvenForTheCorrectValue(): void // T1.3.5
    {
        $this->requestCode();
        $code = (string) $this->mailer->lastCode();
        $wrong = $this->wrongCode($code);
        for ($i = 0; $i < 5; $i++) {
            $this->assertSame(422, $this->verify($wrong)->status);
        }
        $this->assertSame(422, $this->verify($code)->status, 'sixth attempt is refused even with the right code');
        $this->assertSame(1, (int) $this->pdo->query(
            "SELECT COUNT(*) FROM security_log WHERE event_type = 'otp.attempts_exhausted'"
        )->fetchColumn());
        $this->assertFalse($this->app->users->findById($this->userId)->isVerified());
    }

    public function testRequestRateLimitTripsOnTheFourthRequest(): void // T1.3.6
    {
        for ($i = 0; $i < 3; $i++) {
            $this->assertSame(202, $this->requestCode()->status);
        }
        $fourth = $this->requestCode();
        $this->assertSame(429, $fourth->status);
        $this->assertArrayHasKey('Retry-After', $fourth->headers);
        $this->clock->advance('+3601 seconds');
        $this->assertSame(202, $this->requestCode()->status);
    }

    public function testCodeIsStoredOnlyAsAHash(): void // T1.3.7
    {
        $this->requestCode();
        $code = (string) $this->mailer->lastCode();
        $hash = $this->otpRow()['code_hash'];
        $this->assertStringStartsWith('$2y$', $hash);
        $this->assertStringNotContainsString($code, $hash);
        $this->assertTrue(password_verify($code, $hash));
    }

    public function testCodeNeverAppearsInAnyLogOrResponse(): void // T1.3.8
    {
        $res = $this->requestCode();
        $code = (string) $this->mailer->lastCode();
        $ok = $this->verify($code);
        $this->assertStringNotContainsString($code, $res->body . $ok->body);
        foreach (['audit_log', 'security_log', 'throttle_event'] as $table) {
            $dump = json_encode($this->pdo->query("SELECT * FROM {$table}")->fetchAll(), JSON_INVALID_UTF8_SUBSTITUTE);
            $this->assertStringNotContainsString('"' . $code . '"', (string) $dump, $table);
            $this->assertStringNotContainsString($code, (string) $dump, $table);
        }
    }

    public function testRegisteredAndUnregisteredEmailsAreIndistinguishable(): void // T1.3.9
    {
        $known = $this->requestCode('otp@example.com', '198.51.100.31');
        $unknown = $this->requestCode('ghost@example.com', '198.51.100.32');
        $this->assertSame($known->status, $unknown->status);
        $this->assertSame($known->body, $unknown->body);
        $this->assertSame($known->headers, $unknown->headers);
        $this->assertCount(1, $this->mailer->sent, 'only the real account is mailed');
    }

    public function testTimingOfRegisteredAndUnregisteredPathsIsComparable(): void // T1.3.9 (timing)
    {
        $time = function (string $email): float {
            $start = hrtime(true);
            $this->requestCode($email, '198.51.100.' . random_int(40, 250));
            return (hrtime(true) - $start) / 1e6;
        };
        $this->requestCode('warmup@example.com', '198.51.100.39');
        $known = $unknown = 0.0;
        for ($i = 0; $i < 3; $i++) {
            // Different addresses per round so the per-email request limit never intervenes.
            $this->app->users->create("known{$i}@example.com", 'K', 'h');
            $known += $time("known{$i}@example.com");
            $unknown += $time("unknown{$i}@example.com");
        }
        $this->assertLessThan(0.5, abs($known - $unknown) / max($known, $unknown), "known={$known}ms unknown={$unknown}ms");
    }

    public function testVerificationFailureIsIdenticalForWrongExpiredAndUnknownUser(): void
    {
        $this->requestCode();
        $code = (string) $this->mailer->lastCode();
        $wrong = $this->verify($this->wrongCode($code));
        $unknown = $this->verify($code, 'ghost@example.com');
        $this->clock->advance('+11 minutes');
        $expired = $this->verify($code);
        $this->assertSame($wrong->body, $unknown->body);
        $this->assertSame($wrong->body, $expired->body);
        $this->assertSame(422, $unknown->status);
    }

    public function testUsedCodeCannotBeReused(): void // T1.3.11
    {
        $this->requestCode();
        $code = (string) $this->mailer->lastCode();
        $this->assertSame(200, $this->verify($code)->status);
        $again = $this->verify($code);
        $this->assertSame(422, $again->status);
        $this->assertFalse($this->otpRow());
    }

    public function testANewCodeInvalidatesTheOldOne(): void
    {
        $this->requestCode();
        $first = (string) $this->mailer->lastCode();
        $this->requestCode();
        $second = (string) $this->mailer->lastCode();
        if ($first !== $second) {
            $this->assertSame(422, $this->verify($first)->status);
        }
        $this->assertSame(200, $this->verify($second)->status);
    }

    public function testAlreadyVerifiedAccountReceivesNoCode(): void
    {
        $this->app->users->markVerified($this->userId);
        $this->assertSame(202, $this->requestCode()->status);
        $this->assertCount(0, $this->mailer->sent);
    }

    public function testMalformedCodeAndBadEmailFormat(): void
    {
        $this->assertSame(422, $this->verify('12345')->status);
        $this->assertSame(422, $this->verify('abcdef')->status);
        $this->assertSame(422, $this->call($this->kernel, 'POST', '/api/otp/request', ['email' => 'nope'])->status);
    }

    public function testCodesAreSixDigitsAndUniformlyDistributedEnough(): void
    {
        $seen = [];
        for ($i = 0; $i < 60; $i++) {
            $this->app->throttle->clear('otp_request', 'otp@example.com');
            $this->requestCode();
            $code = (string) $this->mailer->lastCode();
            $this->assertMatchesRegularExpression('/^[1-9]\d{5}$/', $code);
            $seen[$code] = true;
        }
        $this->assertGreaterThan(57, count($seen));
    }
}
