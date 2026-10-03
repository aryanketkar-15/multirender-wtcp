<?php

declare(strict_types=1);

namespace Mra\Log;

/**
 * Strips secret-bearing keys from a payload before it is written anywhere. Works on the
 * structure, never on a serialised string, so a password nested two levels down is still caught.
 */
final class Redactor
{
    public const MASK = '[redacted]';

    /** A key is redacted when its lower-cased form contains any of these fragments. */
    private const DENY = [
        'password', 'passwd', 'otp', 'token', 'secret', 'key',
        'session_id', 'sessionid', 'authorization', 'cookie',
    ];

    /**
     * @param array<array-key,mixed> $data
     * @return array<array-key,mixed>
     */
    public static function redact(array $data): array
    {
        $out = [];
        foreach ($data as $key => $value) {
            if (is_string($key) && self::isSecretKey($key)) {
                $out[$key] = self::MASK;
            } elseif (is_array($value)) {
                $out[$key] = self::redact($value);
            } elseif (is_object($value)) {
                $out[$key] = self::redact(get_object_vars($value));
            } else {
                $out[$key] = $value;
            }
        }
        return $out;
    }

    private static function isSecretKey(string $key): bool
    {
        $k = strtolower($key);
        foreach (self::DENY as $fragment) {
            if (str_contains($k, $fragment)) {
                return true;
            }
        }
        return false;
    }
}
