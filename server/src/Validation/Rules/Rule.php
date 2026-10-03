<?php

declare(strict_types=1);

namespace Mra\Validation\Rules;

interface Rule
{
    /** @param array<string,mixed> $data the whole payload, for compare-field rules */
    public function passes(mixed $value, array $data): bool;
}
