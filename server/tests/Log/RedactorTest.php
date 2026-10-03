<?php

declare(strict_types=1);

namespace Mra\Tests\Log;

use Mra\Log\Redactor;
use PHPUnit\Framework\TestCase;

final class RedactorTest extends TestCase
{
    public function testPasswordIsRedacted(): void // T0.3.2
    {
        $out = Redactor::redact(['email' => 'a@b.com', 'password' => 'hunter2']);
        $this->assertSame('[redacted]', $out['password']);
        $this->assertSame('a@b.com', $out['email']);
    }

    public function testNestedSecretIsRedacted(): void // T0.3.3
    {
        $out = Redactor::redact(['user' => ['credentials' => ['password' => 'x']]]);
        $this->assertSame('[redacted]', $out['user']['credentials']['password']);
        $this->assertStringNotContainsString('"x"', json_encode($out));
    }

    public function testOtpIsRedacted(): void // T0.3.4
    {
        $this->assertSame('[redacted]', Redactor::redact(['otp' => '123456'])['otp']);
    }

    /** @dataProvider secretKeys */
    public function testEveryDenylistedKeyIsRedacted(string $key): void
    {
        $this->assertSame('[redacted]', Redactor::redact([$key => 'v'])[$key]);
    }

    /** @return array<string,array{string}> */
    public static function secretKeys(): array
    {
        $keys = ['password', 'Password', 'new_password', 'otp', 'otp_code', 'token', 'csrf_token',
            'secret', 'client_secret', 'key', 'api_key', 'private_key', 'session_id', 'SESSION_ID'];
        return array_combine($keys, array_map(static fn (string $k): array => [$k], $keys));
    }

    public function testSecretsInsideListsOfObjectsAreRedacted(): void
    {
        $out = Redactor::redact(['events' => [['token' => 'abc'], ['name' => 'ok']]]);
        $this->assertSame('[redacted]', $out['events'][0]['token']);
        $this->assertSame('ok', $out['events'][1]['name']);
    }

    public function testObjectPropertiesAreRedacted(): void
    {
        $obj = (object) ['password' => 'p', 'name' => 'n'];
        $out = Redactor::redact(['payload' => $obj]);
        $this->assertSame('[redacted]', $out['payload']['password']);
        $this->assertSame('n', $out['payload']['name']);
    }

    public function testNonSecretValuesPassThroughUntouched(): void
    {
        $data = ['action' => 'user.login', 'count' => 3, 'ok' => true, 'nothing' => null];
        $this->assertSame($data, Redactor::redact($data));
    }
}
