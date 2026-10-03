<?php

declare(strict_types=1);

namespace Mra\Support;

use DateTimeImmutable;

/** Injected so expiry, throttling and timeout logic is testable without sleeping. */
interface Clock
{
    public function now(): DateTimeImmutable;
}
