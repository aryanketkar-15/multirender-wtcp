<?php

declare(strict_types=1);

namespace Mra\Crypto;

use InvalidArgumentException;

/**
 * XChaCha20-Poly1305 (libsodium) authenticated encryption for personal-data columns.
 * Output layout: 24-byte random nonce || ciphertext || 16-byte tag. Non-deterministic by design.
 */
final class FieldCipher implements FieldEncryptor
{
    private const NONCE = SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES;

    public function __construct(private readonly string $key)
    {
        if (strlen($key) !== SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_KEYBYTES) {
            throw new InvalidArgumentException('Encryption key must be exactly 32 bytes.');
        }
    }

    public static function fromHex(string $hex): self
    {
        $bin = ctype_xdigit($hex) && strlen($hex) === 64 ? hex2bin($hex) : false;
        if ($bin === false) {
            throw new InvalidArgumentException('APP_ENCRYPTION_KEY must be 64 hexadecimal characters.');
        }
        return new self($bin);
    }

    public function encrypt(string $plaintext, string $context = ''): string
    {
        $nonce = random_bytes(self::NONCE);
        return $nonce . sodium_crypto_aead_xchacha20poly1305_ietf_encrypt($plaintext, $context, $nonce, $this->key);
    }

    public function decrypt(string $ciphertext, string $context = ''): string
    {
        if (strlen($ciphertext) < self::NONCE + SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_ABYTES) {
            throw new DecryptionException('Ciphertext is too short.');
        }
        $nonce = substr($ciphertext, 0, self::NONCE);
        $plain = sodium_crypto_aead_xchacha20poly1305_ietf_decrypt(
            substr($ciphertext, self::NONCE),
            $context,
            $nonce,
            $this->key
        );
        if ($plain === false) {
            throw new DecryptionException('Authentication failed.');
        }
        return $plain;
    }
}
