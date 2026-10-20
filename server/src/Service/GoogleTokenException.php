<?php

declare(strict_types=1);

namespace Mra\Service;

/** A Google ID token was refused. The reason is for the security log only, never shown to the client. */
final class GoogleTokenException extends \RuntimeException
{
}
