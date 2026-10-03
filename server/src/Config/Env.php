<?php

declare(strict_types=1);

namespace Mra\Config;

/**
 * Environment access. Real process environment wins over the .env file so CI can inject values.
 * The .env file lives in server/, outside the web root (server/public).
 */
final class Env
{
    /** @var array<string,string> */
    private static array $file = [];

    public static function load(string $path): void
    {
        self::$file = [];
        if (!is_file($path)) {
            return;
        }
        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = explode('=', $line, 2);
            self::$file[trim($key)] = trim($value, " \t\"'");
        }
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        $env = getenv($key);
        if ($env !== false && $env !== '') {
            return $env;
        }
        $value = self::$file[$key] ?? null;
        return ($value === null || $value === '') ? $default : $value;
    }

    public static function require(string $key): string
    {
        $value = self::get($key);
        if ($value === null) {
            throw new \RuntimeException("Missing required environment value: {$key}");
        }
        return $value;
    }

    public static function set(string $key, string $value): void
    {
        self::$file[$key] = $value;
    }
}
