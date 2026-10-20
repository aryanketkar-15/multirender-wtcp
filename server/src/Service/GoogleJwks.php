<?php

declare(strict_types=1);

namespace Mra\Service;

/**
 * Google's published signing keys, fetched over HTTPS and cached on disk for an hour. A refresh can be
 * forced (key rotation). If Google cannot be reached the last good copy is used for up to a day;
 * with nothing cached the sign-in fails closed.
 */
final class GoogleJwks
{
    public const URL = 'https://www.googleapis.com/oauth2/v3/certs';
    private const FRESH = 3600;
    private const STALE_OK = 86400;

    public function __construct(private readonly string $cacheFile, private readonly string $url = self::URL)
    {
    }

    /** @return array<string,mixed> */
    public function get(bool $forceRefresh = false): array
    {
        $age = is_file($this->cacheFile) ? time() - (int) filemtime($this->cacheFile) : PHP_INT_MAX;
        if (!$forceRefresh && $age < self::FRESH) {
            return $this->read();
        }
        $fresh = $this->fetch();
        if ($fresh !== null) {
            if (!is_dir(dirname($this->cacheFile))) {
                mkdir(dirname($this->cacheFile), 0770, true);
            }
            file_put_contents($this->cacheFile, json_encode($fresh), LOCK_EX);
            return $fresh;
        }
        if ($age < self::STALE_OK) {
            return $this->read();
        }
        throw new GoogleTokenException('keys_unavailable');
    }

    /** @return array<string,mixed>|null */
    private function fetch(): ?array
    {
        $context = stream_context_create([
            'http' => ['timeout' => 5, 'header' => "Accept: application/json\r\n", 'ignore_errors' => false],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]);
        $body = @file_get_contents($this->url, false, $context);
        if ($body === false) {
            return null;
        }
        $data = json_decode($body, true);
        return is_array($data) && is_array($data['keys'] ?? null) && $data['keys'] !== [] ? $data : null;
    }

    /** @return array<string,mixed> */
    private function read(): array
    {
        $data = json_decode((string) @file_get_contents($this->cacheFile), true);
        return is_array($data) ? $data : ['keys' => []];
    }
}
