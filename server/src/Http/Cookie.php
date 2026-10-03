<?php

declare(strict_types=1);

namespace Mra\Http;

/** A Set-Cookie value. Secure, HttpOnly and SameSite=Strict are not optional here. */
final class Cookie
{
    public function __construct(
        public readonly string $name,
        public readonly string $value,
        public readonly int $maxAge = 0,
        public readonly string $path = '/'
    ) {
    }

    public static function expired(string $name): self
    {
        return new self($name, '', -1);
    }

    public function toHeader(): string
    {
        $parts = [
            $this->name . '=' . rawurlencode($this->value),
            'Path=' . $this->path,
            'HttpOnly',
            'Secure',
            'SameSite=Strict',
        ];
        if ($this->maxAge !== 0) {
            $parts[] = 'Max-Age=' . max(0, $this->maxAge);
        }
        return implode('; ', $parts);
    }
}
