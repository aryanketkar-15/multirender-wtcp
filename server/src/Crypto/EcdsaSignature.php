<?php

declare(strict_types=1);

namespace Mra\Crypto;

/**
 * Converts between the two ECDSA signature encodings in play. WebCrypto produces IEEE P1363
 * (r || s, 64 bytes for P-256); OpenSSL consumes and produces ASN.1 DER.
 */
final class EcdsaSignature
{
    public const P256_BYTES = 64;

    public static function p1363ToDer(string $raw): ?string
    {
        if (strlen($raw) !== self::P256_BYTES) {
            return null;
        }
        $r = self::integer(substr($raw, 0, 32));
        $s = self::integer(substr($raw, 32));
        $body = $r . $s;
        return "\x30" . chr(strlen($body)) . $body;
    }

    public static function derToP1363(string $der): ?string
    {
        if (strlen($der) < 8 || $der[0] !== "\x30") {
            return null;
        }
        $offset = 2;
        if (ord($der[1]) & 0x80) { // long-form length; not expected for P-256 but tolerated
            $offset = 2 + (ord($der[1]) & 0x7f);
        }
        $parts = [];
        for ($i = 0; $i < 2; $i++) {
            if (!isset($der[$offset + 1]) || $der[$offset] !== "\x02") {
                return null;
            }
            $len = ord($der[$offset + 1]);
            $value = substr($der, $offset + 2, $len);
            $parts[] = str_pad(ltrim($value, "\x00"), 32, "\x00", STR_PAD_LEFT);
            $offset += 2 + $len;
        }
        return strlen($parts[0]) === 32 && strlen($parts[1]) === 32 ? $parts[0] . $parts[1] : null;
    }

    private static function integer(string $bytes): string
    {
        $bytes = ltrim($bytes, "\x00");
        if ($bytes === '' || (ord($bytes[0]) & 0x80)) {
            $bytes = "\x00" . $bytes;
        }
        return "\x02" . chr(strlen($bytes)) . $bytes;
    }
}
