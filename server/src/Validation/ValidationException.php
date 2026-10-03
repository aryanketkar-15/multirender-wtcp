<?php

declare(strict_types=1);

namespace Mra\Validation;

final class ValidationException extends \RuntimeException
{
    /** @param array<string,string> $errors field => message */
    public function __construct(public readonly array $errors)
    {
        parent::__construct('Validation failed.');
    }
}
