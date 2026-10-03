<?php

declare(strict_types=1);

namespace Mra\Crypto;

use InvalidArgumentException;

/**
 * RFC 8785 JSON Canonicalization Scheme.
 *
 * Objects are emitted with members sorted by the UTF-16 code units of their names, strings use the
 * minimal escape set, and numbers use ECMAScript's Number-to-String algorithm. Lists keep order.
 * PHP arrays with consecutive integer keys from 0 are lists; any other array is an object.
 * stdClass is always an object (so an empty object is distinguishable from an empty list).
 */
final class Jcs
{
    public static function encode(mixed $value): string
    {
        if ($value === null) {
            return 'null';
        }
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_int($value)) {
            if (abs($value) > 9007199254740992) {
                throw new InvalidArgumentException('Integer outside the IEEE-754 safe range; pass it as a string.');
            }
            return (string) $value;
        }
        if (is_float($value)) {
            return self::number($value);
        }
        if (is_string($value)) {
            return self::string($value);
        }
        if ($value instanceof \stdClass) {
            return self::object((array) $value);
        }
        if (is_array($value)) {
            return array_is_list($value) ? self::list($value) : self::object($value);
        }
        throw new InvalidArgumentException('Unsupported type: ' . get_debug_type($value));
    }

    /** @param array<array-key,mixed> $items */
    private static function list(array $items): string
    {
        return '[' . implode(',', array_map(static fn (mixed $v): string => self::encode($v), $items)) . ']';
    }

    /** @param array<array-key,mixed> $members */
    private static function object(array $members): string
    {
        $original = [];
        $sort = [];
        foreach ($members as $key => $_) {
            $name = (string) $key; // numeric-string keys arrive from PHP as ints
            $original[$name] = $key;
            $sort[$name] = self::utf16($name);
        }
        uasort($sort, static fn (string $a, string $b): int => strcmp($a, $b));
        $parts = [];
        foreach (array_keys($sort) as $name) {
            $parts[] = self::string((string) $name) . ':' . self::encode($members[$original[$name]]);
        }
        return '{' . implode(',', $parts) . '}';
    }

    /** UTF-16BE bytes: byte-wise comparison equals comparison by UTF-16 code unit. */
    private static function utf16(string $s): string
    {
        $converted = @iconv('UTF-8', 'UTF-16BE', $s);
        if ($converted === false) {
            throw new InvalidArgumentException('String is not valid UTF-8.');
        }
        return $converted;
    }

    public static function string(string $s): string
    {
        if (preg_match('//u', $s) !== 1) {
            throw new InvalidArgumentException('String is not valid UTF-8.');
        }
        $out = '';
        foreach (preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $char) {
            $o = ord($char[0]);
            $out .= match (true) {
                $char === '"' => '\\"',
                $char === '\\' => '\\\\',
                $char === "\x08" => '\\b',
                $char === "\x0c" => '\\f',
                $char === "\n" => '\\n',
                $char === "\r" => '\\r',
                $char === "\t" => '\\t',
                $o < 0x20 => sprintf('\\u%04x', $o),
                default => $char,
            };
        }
        return '"' . $out . '"';
    }

    /** ECMAScript Number::toString for finite doubles (RFC 8785 section 3.2.2.3). */
    public static function number(float $f): string
    {
        if (is_nan($f) || is_infinite($f)) {
            throw new InvalidArgumentException('NaN and Infinity cannot be represented in JSON.');
        }
        if ($f == 0.0) {
            return '0';
        }
        $sign = $f < 0 ? '-' : '';
        // Shortest round-trip digits: PHP's serialize_precision -1 via var_export-style formatting.
        $previous = ini_set('serialize_precision', '-1');
        $repr = (string) json_encode(abs($f), JSON_PRESERVE_ZERO_FRACTION, 512);
        ini_set('serialize_precision', (string) $previous);
        $repr = strtolower($repr);
        $exp = 0;
        if (str_contains($repr, 'e')) {
            [$repr, $e] = explode('e', $repr);
            $exp = (int) $e;
        }
        [$int, $frac] = array_pad(explode('.', $repr), 2, '');
        $digits = ltrim($int . $frac, '0');
        $leading = strlen($int . $frac) - strlen($digits);
        // Decimal point position relative to the start of $digits.
        $n = strlen($int) - $leading + $exp;
        $digits = rtrim($digits, '0');
        $k = strlen($digits);
        if ($digits === '') {
            return '0';
        }
        if ($k <= $n && $n <= 21) {
            return $sign . $digits . str_repeat('0', $n - $k);
        }
        if (0 < $n && $n <= 21) {
            return $sign . substr($digits, 0, $n) . '.' . substr($digits, $n);
        }
        if (-6 < $n && $n <= 0) {
            return $sign . '0.' . str_repeat('0', -$n) . $digits;
        }
        $e = $n - 1;
        $expPart = ($e < 0 ? '-' : '+') . abs($e);
        return $sign . ($k === 1 ? $digits : $digits[0] . '.' . substr($digits, 1)) . 'e' . $expPart;
    }
}
