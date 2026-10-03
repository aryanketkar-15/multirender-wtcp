<?php

declare(strict_types=1);

namespace Mra\Validation\Rules;

/** Present and, for strings, non-empty after trimming. Arrays and objects are never accepted. */
final class Required implements Rule
{
    public function passes(mixed $value, array $data): bool
    {
        return is_string($value) && trim($value) !== '';
    }
}
