<?php

declare(strict_types=1);

namespace Mra\Validation;

use Mra\Validation\Rules\Accepted;
use Mra\Validation\Rules\Email;
use Mra\Validation\Rules\ExactDigits;
use Mra\Validation\Rules\IntegerRange;
use Mra\Validation\Rules\Length;
use Mra\Validation\Rules\Matches;
use Mra\Validation\Rules\PasswordComposition;
use Mra\Validation\Rules\Required;
use Mra\Validation\Rules\Rule;

/**
 * The design document's validation-rules table, one method per form.
 *
 * @phpstan-type RuleSet list<array{0:Rule,1:string}>
 */
final class Schemas
{
    public const PASSWORD_MESSAGE = 'Password must be 12–128 characters with a letter and a digit';

    /** @return array<string,list<array{0:Rule,1:string}>> */
    public static function registration(): array
    {
        return [
            'name' => [
                [new Required(), 'Enter your name (2–80 characters)'],
                [new Length(2, 80), 'Enter your name (2–80 characters)'],
            ],
            'email' => [
                [new Required(), 'Enter a valid email address'],
                [new Email(), 'Enter a valid email address'],
            ],
            'password' => self::password(),
            'password_confirm' => [[new Matches('password'), 'Passwords do not match']],
            'accept_terms' => [[new Accepted(), 'You must accept the terms to register']],
        ];
    }

    /** @return array<string,list<array{0:Rule,1:string}>> */
    public static function otp(): array
    {
        return [
            'email' => [[new Email(), 'Enter a valid email address']],
            'code' => [[new ExactDigits(6), 'That code is incorrect or has expired']],
        ];
    }

    /** @return array<string,list<array{0:Rule,1:string}>> */
    public static function passwordReset(): array
    {
        return [
            'password' => self::password(),
            'password_confirm' => [[new Matches('password'), 'Passwords do not match']],
        ];
    }

    /** @return array<string,list<array{0:Rule,1:string}>> */
    public static function settings(): array
    {
        return [
            'validity_minutes' => [[new IntegerRange(1, 60), 'Validity window must be between 1 and 60 minutes']],
            'retention_days' => [[new IntegerRange(1, 3650), 'Retention must be between 1 and 3650 days']],
        ];
    }

    /** @return list<array{0:Rule,1:string}> */
    private static function password(): array
    {
        return [
            [new Required(), self::PASSWORD_MESSAGE],
            [new Length(12, 128, false), self::PASSWORD_MESSAGE],
            [new PasswordComposition(), self::PASSWORD_MESSAGE],
        ];
    }
}
