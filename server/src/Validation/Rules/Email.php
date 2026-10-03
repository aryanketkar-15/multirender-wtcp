<?php

declare(strict_types=1);

namespace Mra\Validation\Rules;

final class Email implements Rule
{
    public function passes(mixed $value, array $data): bool
    {
        if (!is_string($value)) {
            return false;
        }
        $email = trim($value);
        return strlen($email) <= 254 && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }
}
