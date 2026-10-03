<?php

declare(strict_types=1);

namespace Mra\Tests\Support;

use DateTimeImmutable;
use DateTimeZone;
use Mra\Support\Clock;

final class FakeClock implements Clock
{
    private DateTimeImmutable $now;

    public function __construct(string $start = '2026-10-03 12:00:00')
    {
        $this->now = new DateTimeImmutable($start, new DateTimeZone('UTC'));
    }

    public function now(): DateTimeImmutable
    {
        return $this->now;
    }

    public function advance(string $modifier): void
    {
        $this->now = $this->now->modify($modifier);
    }
}
