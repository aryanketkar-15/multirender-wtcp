<?php

declare(strict_types=1);

namespace Mra\Tests\Validation;

use Mra\Validation\Rules\Accepted;
use Mra\Validation\Rules\ExactDigits;
use Mra\Validation\Rules\IntegerRange;
use Mra\Validation\Schemas;
use Mra\Validation\ValidationException;
use Mra\Validation\Validator;
use PHPUnit\Framework\TestCase;

final class ValidatorTest extends TestCase
{
    /** @return array<string,mixed> */
    private function valid(): array
    {
        return [
            'name' => 'Asha Verma',
            'email' => 'asha@example.com',
            'password' => 'correct horse 9 battery',
            'password_confirm' => 'correct horse 9 battery',
            'accept_terms' => true,
        ];
    }

    public function testValidPayloadPasses(): void
    {
        $this->assertSame([], Validator::check($this->valid(), Schemas::registration()));
    }

    public function testRequiredRule(): void
    {
        $data = $this->valid();
        unset($data['name']);
        $this->assertSame(['name' => 'Enter your name (2–80 characters)'], Validator::check($data, Schemas::registration()));
    }

    public function testRequiredRejectsWhitespaceOnlyAndNonStrings(): void
    {
        foreach (['   ', null, ['x'], 5] as $bad) {
            $data = [...$this->valid(), 'name' => $bad];
            $this->assertArrayHasKey('name', Validator::check($data, Schemas::registration()), var_export($bad, true));
        }
    }

    public function testLengthRuleBoundariesAreInclusive(): void
    {
        $name = fn (int $n): array => ['name' => str_repeat('a', $n)] + $this->valid();
        $this->assertArrayHasKey('name', Validator::check($name(1), Schemas::registration()));
        $this->assertArrayNotHasKey('name', Validator::check($name(2), Schemas::registration()));
        $this->assertArrayNotHasKey('name', Validator::check($name(80), Schemas::registration()));
        $this->assertArrayHasKey('name', Validator::check($name(81), Schemas::registration()));
    }

    public function testLengthCountsCharactersNotBytes(): void
    {
        $data = ['name' => str_repeat('山', 80)] + $this->valid();
        $this->assertArrayNotHasKey('name', Validator::check($data, Schemas::registration()));
    }

    public function testEmailRule(): void
    {
        foreach (['notanemail', 'a@', '@b.com', 'a b@c.com', str_repeat('a', 250) . '@b.com'] as $bad) {
            $data = ['email' => $bad] + $this->valid();
            $this->assertSame(
                'Enter a valid email address',
                Validator::check($data, Schemas::registration())['email'] ?? null,
                $bad
            );
        }
    }

    public function testPasswordRangeBoundaries(): void
    {
        $pw = static fn (string $p): array => ['password' => $p, 'password_confirm' => $p];
        $schema = Schemas::registration();
        $this->assertArrayHasKey('password', Validator::check($pw('abcdefghij1') + $this->valid(), $schema)); // 11
        $this->assertArrayNotHasKey('password', Validator::check($pw('abcdefghijk1') + $this->valid(), $schema)); // 12
        $this->assertArrayNotHasKey('password', Validator::check($pw(str_repeat('a', 127) . '1') + $this->valid(), $schema));
        $this->assertArrayHasKey('password', Validator::check($pw(str_repeat('a', 128) . '1') + $this->valid(), $schema));
    }

    public function testPasswordNeedsALetterAndADigit(): void
    {
        $schema = Schemas::registration();
        foreach (['abcdefghijklmnop', '1234567890123456', '!!!!!!!!!!!!!!!!'] as $weak) {
            $data = ['password' => $weak, 'password_confirm' => $weak] + $this->valid();
            $this->assertSame(Schemas::PASSWORD_MESSAGE, Validator::check($data, $schema)['password'] ?? null, $weak);
        }
    }

    public function testPasswordIsNotTrimmed(): void
    {
        $data = ['password' => '            1', 'password_confirm' => '            1'] + $this->valid();
        $this->assertArrayHasKey('password', Validator::check($data, Schemas::registration())); // no letter
    }

    public function testCompareFieldRule(): void
    {
        $data = ['password_confirm' => 'different password 1'] + $this->valid();
        $this->assertSame(['password_confirm' => 'Passwords do not match'], Validator::check($data, Schemas::registration()));
    }

    public function testCompareFieldFailsWhenConfirmationIsMissing(): void
    {
        $data = $this->valid();
        unset($data['password_confirm']);
        $this->assertArrayHasKey('password_confirm', Validator::check($data, Schemas::registration()));
    }

    public function testAcceptedRuleRequiresExplicitTrue(): void
    {
        $rule = new Accepted();
        $this->assertTrue($rule->passes(true, []));
        foreach ([false, null, 'true', 1, 'on'] as $bad) {
            $this->assertFalse($rule->passes($bad, []), var_export($bad, true));
        }
    }

    public function testIntegerRangeBoundariesForValidityWindow(): void // range validation: 1-60 minutes
    {
        $schema = Schemas::settings();
        $ok = ['retention_days' => 30];
        foreach ([1, 60, '15'] as $good) {
            $this->assertArrayNotHasKey('validity_minutes', Validator::check(['validity_minutes' => $good] + $ok, $schema));
        }
        foreach ([0, 61, -5, 'abc', 1.5, null, '1.5', ''] as $bad) {
            $this->assertSame(
                'Validity window must be between 1 and 60 minutes',
                Validator::check(['validity_minutes' => $bad] + $ok, $schema)['validity_minutes'] ?? null,
                var_export($bad, true)
            );
        }
    }

    public function testIntegerRangeBoundariesForRetention(): void // range validation: 1-3650 days
    {
        $rule = new IntegerRange(1, 3650);
        $this->assertTrue($rule->passes(1, []));
        $this->assertTrue($rule->passes(3650, []));
        $this->assertFalse($rule->passes(0, []));
        $this->assertFalse($rule->passes(3651, []));
    }

    public function testOtpFormat(): void
    {
        $rule = new ExactDigits(6);
        $this->assertTrue($rule->passes('012345', []));
        foreach (['12345', '1234567', '12345a', ' 12345', 123456, null] as $bad) {
            $this->assertFalse($rule->passes($bad, []), var_export($bad, true));
        }
    }

    public function testAssertThrowsWithFieldErrors(): void
    {
        try {
            Validator::assert(['name' => ''], Schemas::registration());
            $this->fail('expected exception');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('name', $e->errors);
            $this->assertArrayHasKey('email', $e->errors);
        }
    }

    public function testPasswordResetSchemaHasCompareField(): void
    {
        $errors = Validator::check(
            ['password' => 'a-long-enough-pass1', 'password_confirm' => 'nope'],
            Schemas::passwordReset()
        );
        $this->assertSame(['password_confirm' => 'Passwords do not match'], $errors);
    }
}
