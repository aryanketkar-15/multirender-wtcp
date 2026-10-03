<?php

declare(strict_types=1);

namespace Mra\Tests\Support;

use PDO;
use PDOException;

/** A PDO whose every prepare fails, standing in for an unavailable database. */
final class BrokenPdo extends PDO
{
    #[\ReturnTypeWillChange]
    public function prepare(string $query, array $options = [])
    {
        throw new PDOException('connection lost');
    }
}
