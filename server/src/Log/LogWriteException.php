<?php

declare(strict_types=1);

namespace Mra\Log;

/** A log write failed. Callers must let this propagate; logging failures are never swallowed. */
final class LogWriteException extends \RuntimeException
{
}
