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

    /**
     * The state of a nonce without changing it.
     *
     * @return array{session_id:string,consumed:bool,expired:bool,bundle_id:string}|null
     */
    public function inspect(string $nonce): ?array
    {
        $row = $this->run(
            'SELECT session_id, bundle_id, consumed_at, expires_at FROM mra_nonce WHERE nonce = ?',
            [$nonce]
        )->fetch();
        if ($row === false) {
            return null;
        }
        return [
            'session_id' => (string) $row['session_id'],
            'bundle_id' => (string) $row['bundle_id'],
            'consumed' => $row['consumed_at'] !== null,
            'expired' => (string) $row['expires_at'] <= SystemClock::db($this->clock->now()),
        ];
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
