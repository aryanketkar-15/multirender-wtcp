<?php

declare(strict_types=1);

namespace Mra\Validation\Rules;

/** Inclusive length range in Unicode characters (not bytes). */
final class Length implements Rule
{
    public function __construct(private readonly int $min, private readonly int $max, private readonly bool $trim = true)
    {
    }

    public function passes(mixed $value, array $data): bool
    {
        if (!is_string($value)) {
            return false;
        }
        $len = mb_strlen($this->trim ? trim($value) : $value, 'UTF-8');
        return $len >= $this->min && $len <= $this->max;
    }
}
