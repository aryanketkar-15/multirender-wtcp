<?php

declare(strict_types=1);

namespace Mra\Repository;

use InvalidArgumentException;
use PDO;
use PDOStatement;

/**
 * Every repository extends this. The only way to reach the database is run(), which prepares
 * and binds. SQL containing a quote character is refused: literals must be bound parameters.
 */
abstract class BaseRepository
{
    public function __construct(protected readonly PDO $pdo)
    {
    }

    /**
     * @param array<int|string,mixed> $params
     */
    protected function run(string $sql, array $params = []): PDOStatement
    {
        if (str_contains($sql, "'") || str_contains($sql, '"')) {
            throw new InvalidArgumentException('SQL must not contain quoted literals; bind a parameter.');
        }
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }
}
