<?php

declare(strict_types=1);

namespace Mra\Repository;

/** Raised when a connection cannot be made. The message never carries credentials. */
final class DatabaseException extends \PDOException
{
}
