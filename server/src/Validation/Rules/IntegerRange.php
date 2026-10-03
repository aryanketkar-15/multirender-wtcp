<?php

declare(strict_types=1);

namespace Mra\Validation\Rules;

/** Whole number within an inclusive range. Accepts ints and digit-only strings; rejects floats. */
final class IntegerRange implements Rule
{
    public function __construct(private readonly int $min, private readonly int $max)
    {
    }

    public function passes(mixed $value, array $data): bool
    {
        if (is_string($value) && preg_match('/^-?\d{1,18}$/', trim($value)) === 1) {
            $value = (int) $value;
        }
        return is_int($value) && $value >= $this->min && $value <= $this->max;
    }
}
