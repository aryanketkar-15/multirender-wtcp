<?php

declare(strict_types=1);

namespace Mra\Validation\Rules;

/** At least one letter and one digit. */
final class PasswordComposition implements Rule
{
    public function passes(mixed $value, array $data): bool
    {
        return is_string($value)
            && preg_match('/\p{L}/u', $value) === 1
            && preg_match('/\d/', $value) === 1;
    }
}
