<?php

declare(strict_types=1);

namespace Mra\Http;

final class Request
{
    /**
     * @param array<string,mixed> $body
     * @param array<string,string> $headers lower-case names
     * @param array<string,string> $cookies
     * @param array<string,string> $query
     */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $body = [],
        public readonly array $headers = [],
        public readonly array $cookies = [],
        public readonly string $ip = '0.0.0.0',
        public readonly ?string $userAgent = null,
        public readonly array $query = [],
        public readonly bool $malformedBody = false
    ) {
    }

    public static function fromGlobals(): self
    {
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with((string) $key, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr((string) $key, 5)))] = (string) $value;
            }
        }
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $headers['content-type'] = (string) $_SERVER['CONTENT_TYPE'];
        }
        $raw = file_get_contents('php://input') ?: '';
        $body = [];
        $malformed = false;
        if ($raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $body = $decoded;
            } else {
                $malformed = true;
            }
        }
        $path = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/';
        return new self(
            strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')),
            $path,
            $body,
            $headers,
            array_map('strval', $_COOKIE),
            // Only the socket address is trusted. Forwarding headers are client-controlled.
            (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'),
            $headers['user-agent'] ?? null,
            array_map('strval', $_GET),
            $malformed
        );
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }

    public function cookie(string $name): ?string
    {
        return $this->cookies[$name] ?? null;
    }

    public function isStateChanging(): bool
    {
        return !in_array($this->method, ['GET', 'HEAD', 'OPTIONS'], true);
    }

    /** A new request carrying extra attributes, used by middleware to hand data downstream. */
    public function with(string $key, mixed $value): self
    {
        $clone = clone $this;
        $clone->attributes[$key] = $value;
        return $clone;
    }

    /** @var array<string,mixed> */
    private array $attributes = [];

    public function attribute(string $key): mixed
    {
        return $this->attributes[$key] ?? null;
    }
}
