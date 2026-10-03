<?php

declare(strict_types=1);

namespace Mra\Validation\Rules;

/** An explicit boolean true. A missing or false value is a refusal; there is no default. */
final class Accepted implements Rule
{
    public function passes(mixed $value, array $data): bool
    {
        return $value === true;
    }
}
