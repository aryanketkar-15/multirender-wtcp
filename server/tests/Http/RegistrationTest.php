<?php

declare(strict_types=1);

namespace Mra\Tests\Http;

use Mra\Http\Kernel;
use Mra\Tests\TestCase;

final class RegistrationTest extends TestCase
{
    private Kernel $kernel;

    protected function setUp(): void
    {
        parent::setUp();
        $this->kernel = new Kernel($this->makeApp());
    }

    /** @return array<string,mixed> */
    private function payload(string $email = 'asha@example.com'): array
    {
        return [
            'name' => 'Asha Verma',
            'email' => $email,
            'password' => 'correct horse 9 battery',
            'password_confirm' => 'correct horse 9 battery',
            'accept_terms' => true,
        ];
    }

    private function rows(string $table): int
    {
        return (int) $this->pdo->query("SELECT COUNT(*) FROM {$table}")->fetchColumn();
    }

    public function testValidRegistrationCreatesAnUnverifiedUser(): void // T1.2.1
    {
        $res = $this->call($this->kernel, 'POST', '/api/register', $this->payload());
        $this->assertSame(201, $res->status);
        $this->assertTrue($res->data()['verification_required']);
        $user = $this->makeApp()->users->findByEmail('asha@example.com');
        $this->assertNotNull($user);
        $this->assertFalse($user->isVerified());
        $this->assertStringStartsWith('$argon2id$', $user->passwordHash);
    }

    public function testMissingRequiredFieldIsRejectedWithAFieldError(): void // T1.2.2
    {
        $body = $this->payload();
        unset($body['name']);
        $before = $this->rows('users');
        $res = $this->call($this->kernel, 'POST', '/api/register', $body);
        $this->assertSame(422, $res->status);
        $this->assertSame('Enter your name (2–80 characters)', $res->data()['fields']['name']);
        $this->assertSame($before, $this->rows('users'));
    }

    public function testInvalidEmailFormat(): void // T1.2.3
    {
        $res = $this->call($this->kernel, 'POST', '/api/register', $this->payload('notanemail'));
        $this->assertSame(422, $res->status);
        $this->assertSame('Enter a valid email address', $res->data()['fields']['email']);
    }

    public function testPasswordMismatch(): void // T1.2.4
    {
        $res = $this->call($this->kernel, 'POST', '/api/register', ['password_confirm' => 'B'] + $this->payload());
        $this->assertSame(422, $res->status);
        $this->assertSame('Passwords do not match', $res->data()['fields']['password_confirm']);
    }

    public function testEightCharacterPasswordIsBelowRange(): void // T1.2.5
    {
        $body = ['password' => 'abcd1234', 'password_confirm' => 'abcd1234'] + $this->payload();
        $res = $this->call($this->kernel, 'POST', '/api/register', $body);
        $this->assertSame(422, $res->status);
        $this->assertArrayHasKey('password', $res->data()['fields']);
    }

    public function testConsentBoxMustBeExplicitlyTicked(): void
    {
        foreach ([false, null, 'on'] as $value) {
            $res = $this->call($this->kernel, 'POST', '/api/register', ['accept_terms' => $value] + $this->payload());
            $this->assertSame(422, $res->status);
            $this->assertArrayHasKey('accept_terms', $res->data()['fields']);
        }
    }

    public function testDuplicateEmailIsAGenericConflict(): void // T1.2.7
    {
        $this->call($this->kernel, 'POST', '/api/register', $this->payload());
        $res = $this->call($this->kernel, 'POST', '/api/register', $this->payload('ASHA@example.com'));
        $this->assertSame(409, $res->status);
        $this->assertStringNotContainsStringIgnoringCase('already registered', $res->body);
        $this->assertStringNotContainsString('asha@example.com', strtolower($res->body));
        $this->assertSame(1, $this->rows('users'));
    }

    public function testPasswordIsNeverStoredOrLogged(): void // T1.2.8
    {
        $secret = 'correct horse 9 battery';
        $this->call($this->kernel, 'POST', '/api/register', $this->payload());
        $this->call($this->kernel, 'POST', '/api/register', ['password_confirm' => 'x'] + $this->payload('b@example.com'));
        $this->call($this->kernel, 'POST', '/api/register', $this->payload());
        foreach (['users', 'audit_log', 'security_log', 'throttle_event'] as $table) {
            $dump = json_encode($this->pdo->query("SELECT * FROM {$table}")->fetchAll(), JSON_INVALID_UTF8_SUBSTITUTE);
            $this->assertStringNotContainsString($secret, (string) $dump, $table);
            $this->assertStringNotContainsString('horse', (string) $dump, $table);
        }
    }

    public function testResponseNeverContainsThePasswordOrItsHash(): void
    {
        $res = $this->call($this->kernel, 'POST', '/api/register', $this->payload());
        $this->assertStringNotContainsString('horse', $res->body);
        $this->assertStringNotContainsString('argon2', $res->body);
    }

    public function testRateLimitTripsOnTheSixthAttempt(): void // T1.2.9
    {
        for ($i = 1; $i <= 5; $i++) {
            $res = $this->call($this->kernel, 'POST', '/api/register', $this->payload("user{$i}@example.com"), '203.0.113.50');
            $this->assertSame(201, $res->status, "attempt {$i}");
        }
        $sixth = $this->call($this->kernel, 'POST', '/api/register', $this->payload('user6@example.com'), '203.0.113.50');
        $this->assertSame(429, $sixth->status);
        $this->assertGreaterThan(0, (int) $sixth->headers['Retry-After']);
        $this->assertSame(1, (int) $this->pdo->query(
            "SELECT COUNT(*) FROM security_log WHERE event_type = 'register.rate_limited'"
        )->fetchColumn());
        $this->assertNull($this->makeApp()->users->findByEmail('user6@example.com'));
    }

    public function testRateLimitIsPerIpAndExpiresAfterTheWindow(): void
    {
        for ($i = 1; $i <= 5; $i++) {
            $this->call($this->kernel, 'POST', '/api/register', $this->payload("a{$i}@example.com"), '203.0.113.60');
        }
        $other = $this->call($this->kernel, 'POST', '/api/register', $this->payload('other@example.com'), '203.0.113.61');
        $this->assertSame(201, $other->status);
        $this->clock->advance('+3601 seconds');
        $again = $this->call($this->kernel, 'POST', '/api/register', $this->payload('later@example.com'), '203.0.113.60');
        $this->assertSame(201, $again->status);
    }

    public function testRepeatedValidationFailuresAreSecurityLogged(): void
    {
        for ($i = 0; $i < 3; $i++) {
            $this->call($this->kernel, 'POST', '/api/register', ['email' => 'bad'] + $this->payload(), '203.0.113.70');
        }
        $this->assertSame(1, (int) $this->pdo->query(
            "SELECT COUNT(*) FROM security_log WHERE event_type = 'register.repeated_validation_failure'"
        )->fetchColumn());
    }

    public function testUnicodeNameRoundTrips(): void // T1.2.10
    {
        $res = $this->call($this->kernel, 'POST', '/api/register', ['name' => 'Ayşe Çelik — 山田'] + $this->payload());
        $this->assertSame(201, $res->status);
        $this->assertSame('Ayşe Çelik — 山田', $this->makeApp()->users->findByEmail('asha@example.com')->name);
    }

    public function testAuditEntryWrittenOnSuccessWithoutPersonalDataInDetail(): void
    {
        $this->call($this->kernel, 'POST', '/api/register', $this->payload());
        $row = $this->pdo->query("SELECT * FROM audit_log WHERE action = 'user.register'")->fetch();
        $this->assertSame('success', $row['outcome']);
        $this->assertNotNull($row['actor_id']);
        $this->assertNotNull($row['ip_enc']);
        $this->assertStringNotContainsString('198.51.100.1', $row['ip_enc']);
    }

    public function testUnknownRouteAndWrongMethod(): void
    {
        $this->assertSame(404, $this->call($this->kernel, 'GET', '/api/nope')->status);
        $res = $this->call($this->kernel, 'GET', '/api/register');
        $this->assertSame(405, $res->status);
        $this->assertSame('POST', $res->headers['Allow']);
    }

    public function testMalformedJsonIsABadRequest(): void
    {
        $res = $this->kernel->handle(new \Mra\Http\Request('POST', '/api/register', [], [], [], '198.51.100.9', null, [], true));
        $this->assertSame(400, $res->status);
    }
}
