<?php

declare(strict_types=1);

namespace Mra\Service;

use Mra\Crypto\BlindIndex;
use Mra\Repository\BaseRepository;
use Mra\Support\Clock;
use Mra\Support\SystemClock;
use PDO;

/**
 * Sliding-window event counter backing every rate limit and login backoff. Subjects (IP address,
 * email) are keyed-hashed so the table holds no personal data.
 */
final class ThrottleService extends BaseRepository
{
    public function __construct(PDO $pdo, private readonly BlindIndex $index, private readonly Clock $clock)
    {
        parent::__construct($pdo);
    }

    public function record(string $bucket, string $subject): void
    {
        $this->run(
            'INSERT INTO throttle_event (bucket, subject, created_at) VALUES (?, ?, ?)',
            [$bucket, $this->key($bucket, $subject), SystemClock::db($this->clock->now())]
        );
    }

    public function count(string $bucket, string $subject, int $windowSeconds): int
    {
        $since = $this->clock->now()->modify("-{$windowSeconds} seconds");
        $stmt = $this->run(
            'SELECT COUNT(*) FROM throttle_event WHERE bucket = ? AND subject = ? AND created_at > ?',
            [$bucket, $this->key($bucket, $subject), SystemClock::db($since)]
        );
        return (int) $stmt->fetchColumn();
    }

    /** True when `$limit` or more events already sit inside the window. */
    public function isLimited(string $bucket, string $subject, int $limit, int $windowSeconds): bool
    {
        return $this->count($bucket, $subject, $windowSeconds) >= $limit;
    }

    /** Seconds until the oldest in-window event expires, at least 1. */
    public function retryAfter(string $bucket, string $subject, int $windowSeconds): int
    {
        $since = $this->clock->now()->modify("-{$windowSeconds} seconds");
        $oldest = $this->run(
            'SELECT MIN(created_at) FROM throttle_event WHERE bucket = ? AND subject = ? AND created_at > ?',
            [$bucket, $this->key($bucket, $subject), SystemClock::db($since)]
        )->fetchColumn();
        if ($oldest === false || $oldest === null) {
            return 1;
        }
        $expires = (new \DateTimeImmutable((string) $oldest, new \DateTimeZone('UTC')))
            ->modify("+{$windowSeconds} seconds");
        return max(1, $expires->getTimestamp() - $this->clock->now()->getTimestamp());
    }

    /** Time of the most recent in-window event, or null. */
    public function latest(string $bucket, string $subject, int $windowSeconds): ?\DateTimeImmutable
    {
        $since = $this->clock->now()->modify("-{$windowSeconds} seconds");
        $at = $this->run(
            'SELECT MAX(created_at) FROM throttle_event WHERE bucket = ? AND subject = ? AND created_at > ?',
            [$bucket, $this->key($bucket, $subject), SystemClock::db($since)]
        )->fetchColumn();
        return ($at === false || $at === null) ? null : new \DateTimeImmutable((string) $at, new \DateTimeZone('UTC'));
    }

    public function clear(string $bucket, string $subject): void
    {
        $this->run('DELETE FROM throttle_event WHERE bucket = ? AND subject = ?', [$bucket, $this->key($bucket, $subject)]);
    }

    public function prune(int $olderThanSeconds): void
    {
        $cutoff = $this->clock->now()->modify("-{$olderThanSeconds} seconds");
        $this->run('DELETE FROM throttle_event WHERE created_at < ?', [SystemClock::db($cutoff)]);
    }

    private function key(string $bucket, string $subject): string
    {
        return $this->index->forValue('throttle:' . $bucket, $subject);
    }
}
