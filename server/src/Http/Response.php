<?php

declare(strict_types=1);

namespace Mra\Http;

final class Response
{
    /**
     * @param array<string,string> $headers
     * @param list<Cookie> $cookies
     */
    public function __construct(
        public readonly int $status,
        public readonly string $body = '',
        public readonly array $headers = [],
        public readonly array $cookies = []
    ) {
    }

    /** @param array<array-key,mixed> $data */
    public static function json(array $data, int $status = 200): self
    {
        return new self(
            $status,
            (string) json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ['Content-Type' => 'application/json; charset=utf-8']
        );
    }

    public static function error(int $status, string $code, string $message): self
    {
        return self::json(['error' => $code, 'message' => $message], $status);
    }

    public function withHeader(string $name, string $value): self
    {
        return new self($this->status, $this->body, [...$this->headers, $name => $value], $this->cookies);
    }

    public function withCookie(Cookie $cookie): self
    {
        return new self($this->status, $this->body, $this->headers, [...$this->cookies, $cookie]);
    }

    /** @return array<array-key,mixed> */
    public function data(): array
    {
        $decoded = json_decode($this->body, true);
        return is_array($decoded) ? $decoded : [];
    }

    public function send(): void
    {
        http_response_code($this->status);
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store');
        foreach ($this->headers as $name => $value) {
            header($name . ': ' . $value);
        }
        foreach ($this->cookies as $cookie) {
            header('Set-Cookie: ' . $cookie->toHeader(), false);
        }
        echo $this->body;
    }
}
