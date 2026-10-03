<?php

declare(strict_types=1);

namespace Mra\Crypto;

/** Ed25519 detached signatures over canonical (JCS) text, encoded base64url without padding. */
final class Signer
{
    public function __construct(private readonly KeyStore $keys)
    {
    }

    public function keyId(): string
    {
        return $this->keys->currentKeyId();
    }

    public function sign(string $message): string
    {
        return self::b64($this->keys->sign($message));
    }

    /** Verifies against the key named by $keyId; an unknown key id fails closed. */
    public function verify(string $message, string $signature, string $keyId): bool
    {
        $public = $this->keys->publicKey($keyId);
        $raw = self::unb64($signature);
        if ($public === null || $raw === null || strlen($raw) !== SODIUM_CRYPTO_SIGN_BYTES) {
            return false;
        }
        return sodium_crypto_sign_verify_detached($raw, $message, $public);
    }

    /** Verifies against an explicit public key (hex), as an independent verifier would. */
    public static function verifyWithPublicKey(string $message, string $signature, string $publicKeyHex): bool
    {
        $raw = self::unb64($signature);
        $public = ctype_xdigit($publicKeyHex) && strlen($publicKeyHex) === 64 ? hex2bin($publicKeyHex) : false;
        if ($raw === null || $public === false || strlen($raw) !== SODIUM_CRYPTO_SIGN_BYTES) {
            return false;
        }
        return sodium_crypto_sign_verify_detached($raw, $message, $public);
    }

    public static function b64(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    public static function unb64(string $text): ?string
    {
        if (preg_match('/^[A-Za-z0-9_-]*$/', $text) !== 1) {
            return null;
        }
        $raw = base64_decode(strtr($text, '-_', '+/') . str_repeat('=', (4 - strlen($text) % 4) % 4), true);
        return $raw === false ? null : $raw;
    }
}
