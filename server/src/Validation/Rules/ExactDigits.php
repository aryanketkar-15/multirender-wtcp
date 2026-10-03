<?php

declare(strict_types=1);

namespace Mra\Validation\Rules;

final class ExactDigits implements Rule
{
    public function __construct(private readonly int $count)
    {
    }

    public function passes(mixed $value, array $data): bool
    {
        return is_string($value) && preg_match('/^\d{' . $this->count . '}$/', $value) === 1;
    }
}
