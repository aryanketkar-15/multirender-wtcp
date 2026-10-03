<?php

declare(strict_types=1);

namespace Mra\Crypto;

/** Authentication failed: tampered ciphertext, wrong key or wrong context. No plaintext is returned. */
final class DecryptionException extends \RuntimeException
{
}
