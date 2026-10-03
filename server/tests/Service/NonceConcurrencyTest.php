<?php

declare(strict_types=1);

namespace Mra\Tests\Service;

use Mra\Config\DatabaseConfig;
use Mra\Repository\Database;
use Mra\Service\NonceService;
use Mra\Support\SystemClock;
use PHPUnit\Framework\TestCase;

/** Needs real committed rows and OS processes, so it sits outside the rolled-back transaction. */
final class NonceConcurrencyTest extends TestCase
{
    public function testSimultaneousConsumptionsYieldExactlyOneSuccess(): void // T2.3.9
    {
        $pdo = Database::connection(DatabaseConfig::fromEnv(true));
        $pdo->prepare('INSERT INTO users (email_enc, email_bidx, name_enc, password_hash) VALUES (?, ?, ?, ?)')
            ->execute([random_bytes(40), random_bytes(32), random_bytes(40), 'h']);
        $userId = (int) $pdo->lastInsertId();
        try {
            $sessionId = hash('sha256', random_bytes(8));
            $now = (new SystemClock())->now();
            $pdo->prepare('INSERT INTO sessions (id, user_id, csrf_token, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
                ->execute([$sessionId, $userId, str_repeat('0', 64), SystemClock::db($now), SystemClock::db($now)]);
            $nonces = new NonceService($pdo, new SystemClock());

            for ($round = 0; $round < 5; $round++) {
                $nonce = $nonces->issue($sessionId, $userId, 'sha256:' . str_repeat('b', 64), 'bnd_c');
                $this->assertSame(1, $this->race($nonce, $sessionId), "round {$round}: exactly one attestation may win");
            }
        } finally {
            $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]); // cascades to sessions and nonces
        }
    }

    private function race(string $nonce, string $sessionId): int
    {
        $flags = array_filter(explode(' ', (string) getenv('MRA_TEST_PHP_FLAGS')));
        $script = dirname(__DIR__) . '/Support/consume_nonce.php';
        $start = microtime(true) + 1.5;
        $procs = [];
        $pipes = [];
        for ($i = 0; $i < 3; $i++) {
            $cmd = [PHP_BINARY, ...$flags, $script, $nonce, $sessionId, (string) $start];
            $procs[$i] = proc_open($cmd, [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes[$i]);
        }
        $wins = 0;
        foreach ($procs as $i => $proc) {
            $out = trim((string) stream_get_contents($pipes[$i][1]));
            $this->assertContains($out, ['0', '1'], 'child said: ' . $out . (string) stream_get_contents($pipes[$i][2]));
            $wins += (int) $out;
            proc_close($proc);
        }
        return $wins;
    }
}
