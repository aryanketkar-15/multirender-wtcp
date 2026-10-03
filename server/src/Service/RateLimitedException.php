<?php

declare(strict_types=1);

namespace Mra\Service;

final class RateLimitedException extends \RuntimeException
{
    public function __construct(public readonly int $retryAfter)
    {
        parent::__construct('Too many requests.');
    }
}
