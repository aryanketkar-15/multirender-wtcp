<?php

declare(strict_types=1);

namespace Mra\Tests\Service;

use Mra\Service\NonceService;
use Mra\Tests\TestCase;

final class NonceServiceTest extends TestCase
{
    private NonceService $nonces;
    private int $userId;
    private string $sessionA;
    private string $sessionB;

    protected function setUp(): void
    {
        parent::setUp();
        $app = $this->makeApp();
        $this->nonces = new NonceService($this->pdo, $this->clock);
        $this->userId = $app->users->create('nonce@example.com', 'N', 'h');
        $this->sessionA = $app->sessions->create($this->userId)['session']->id;
        $this->sessionB = $app->sessions->create($this->userId)['session']->id;
    }

    private function issue(string $session): string
    {
        return $this->nonces->issue($session, $this->userId, 'sha256:' . str_repeat('a', 64), 'bnd_x');
    }

    public function testNoncesAreDistinctPerRequest(): void // T2.3.4
    {
        $this->assertNotSame($this->issue($this->sessionA), $this->issue($this->sessionA));
    }

    public function testNonceIsBoundToItsSession(): void // T2.3.5
    {
        $nonce = $this->issue($this->sessionA);
        $this->assertFalse($this->nonces->consume($nonce, $this->sessionB));
        $this->assertTrue($this->nonces->consume($nonce, $this->sessionA), 'the wrong-session attempt did not burn it');
    }

    public function testNonceExpiresAfterFifteenMinutes(): void // T2.3.7
    {
        $nonce = $this->issue($this->sessionA);
        $this->clock->advance('+14 minutes 59 seconds');
        $fresh = $this->issue($this->sessionA);
        $this->assertTrue($this->nonces->consume($fresh, $this->sessionA));
        $this->clock->advance('+16 minutes');
        $this->assertFalse($this->nonces->consume($nonce, $this->sessionA));
    }

    public function testNonceIsSingleUse(): void // T2.3.8
    {
        $nonce = $this->issue($this->sessionA);
        $this->assertTrue($this->nonces->consume($nonce, $this->sessionA));
        $this->assertFalse($this->nonces->consume($nonce, $this->sessionA));
    }

    public function testUnknownNonceIsRejected(): void
    {
        $this->assertFalse($this->nonces->consume(str_repeat('0', 64), $this->sessionA));
    }

    public function testNonceUnpredictability(): void // T2.3.6
    {
        $seen = [];
        $bytes = array_fill(0, 256, 0);
        $bits = 0;
        $n = 10000;
        for ($i = 0; $i < $n; $i++) {
            $nonce = NonceService::generate();
            $this->assertSame(64, strlen($nonce));
            $seen[$nonce] = true;
            foreach (str_split(hex2bin($nonce)) as $byte) {
                $bytes[ord($byte)]++;
                $bits += substr_count(decbin(ord($byte)), '1');
            }
        }
        $this->assertCount($n, $seen, 'no collisions in 10,000 nonces');

        $total = $n * 32;
        $expected = $total / 256;
        $chi = 0.0;
        foreach ($bytes as $count) {
            $chi += (($count - $expected) ** 2) / $expected;
        }
        // 255 degrees of freedom: mean 255, sd ~22.6. A band of +/- 5 sd would still be astronomically unlikely.
        $this->assertGreaterThan(140, $chi, "byte distribution suspiciously uniform: chi2={$chi}");
        $this->assertLessThan(370, $chi, "byte distribution is skewed: chi2={$chi}");
        $this->assertEqualsWithDelta(0.5, $bits / ($total * 8), 0.005, 'bit balance');
    }
}
