<?php

declare(strict_types=1);

namespace Mra\Service;

use Mra\Repository\BaseRepository;
use Mra\Support\Clock;
use Mra\Support\SystemClock;
use PDO;

/**
 * Single-use nonces bound to one session. 32 bytes from random_bytes() (never uniqid or mt_rand:
 * a predictable nonce defeats replay protection while passing every functional test). Consumption
 * is one atomic UPDATE and a row-count check: read-then-write would let two concurrent
 * attestations share one nonce.
 */
final class NonceService extends BaseRepository
{
    public const TTL_SECONDS = 900;

    public function __construct(PDO $pdo, private readonly Clock $clock)
    {
        parent::__construct($pdo);
    }

    public static function generate(): string
    {
        return bin2hex(random_bytes(32));
    }

    /** @return string the nonce */
    public function issue(string $sessionId, int $userId, string $clientKeyFpr, string $bundleId): string
    {
        $nonce = self::generate();
        $now = $this->clock->now();
        $this->run(
            'INSERT INTO mra_nonce (nonce, session_id, user_id, client_pubkey_fpr, bundle_id, issued_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                $nonce,
                $sessionId,
                $userId,
                $clientKeyFpr,
                $bundleId,
                SystemClock::db($now),
                SystemClock::db($now->modify('+' . self::TTL_SECONDS . ' seconds')),
            ]
        );
        return $nonce;
    }

    /** True for exactly one caller; false for replay, wrong session, expiry or unknown nonce. */
    public function consume(string $nonce, string $sessionId): bool
    {
        $now = SystemClock::db($this->clock->now());
        return $this->run(
            'UPDATE mra_nonce SET consumed_at = ?
             WHERE nonce = ? AND session_id = ? AND consumed_at IS NULL AND expires_at > ?',
            [$now, $nonce, $sessionId, $now]
        )->rowCount() === 1;
    }
}
