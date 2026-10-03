<?php

declare(strict_types=1);

namespace Mra\Validation\Rules;

/** Compare-field rule: the value must equal another field of the same payload. */
final class Matches implements Rule
{
    public function __construct(private readonly string $otherField)
    {
    }

    public function passes(mixed $value, array $data): bool
    {
        $other = $data[$this->otherField] ?? null;
        return is_string($value) && is_string($other) && hash_equals($other, $value);
    }
}
