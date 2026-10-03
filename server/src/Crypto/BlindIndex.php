<?php

declare(strict_types=1);

namespace Mra\Crypto;

use InvalidArgumentException;

/**
 * HMAC-SHA256 blind index: makes an encrypted email column searchable without deterministic
 * encryption (which would leak equality across the table). The pepper lives outside the database,
 * so a dump alone does not allow testing guessed addresses.
 */
final class BlindIndex
{
    public function __construct(private readonly string $pepper)
    {
        if (strlen($pepper) < 32) {
            throw new InvalidArgumentException('Blind index pepper must be at least 32 bytes.');
        }
    }

    public static function fromHex(string $hex): self
    {
        $bin = ctype_xdigit($hex) && strlen($hex) === 64 ? hex2bin($hex) : false;
        if ($bin === false) {
            throw new InvalidArgumentException('BLIND_INDEX_PEPPER must be 64 hexadecimal characters.');
        }
        return new self($bin);
    }

    /** @return string 32 raw bytes */
    public function forEmail(string $email): string
    {
        return hash_hmac('sha256', mb_strtolower(trim($email)), $this->pepper, true);
    }
}
