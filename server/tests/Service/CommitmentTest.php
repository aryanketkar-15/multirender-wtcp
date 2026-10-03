<?php

declare(strict_types=1);

namespace Mra\Tests\Service;

use InvalidArgumentException;
use Mra\App;
use Mra\Crypto\Jcs;
use Mra\Crypto\KeyStore;
use Mra\Crypto\Signer;
use Mra\Http\Kernel;
use Mra\Model\Bundle;
use Mra\Repository\CommitmentRepository;
use Mra\Service\BundleBuilder;
use Mra\Service\CommitmentService;
use Mra\Tests\Support\BundleFixture;
use Mra\Tests\TestCase;

final class CommitmentTest extends TestCase
{
    private App $app;
    private Bundle $bundle;

    protected function setUp(): void
    {
        parent::setUp();
        $this->app = $this->makeApp();
        $this->bundle = (new BundleBuilder())->build(BundleFixture::spec());
    }

    /** @return array<string,mixed> */
    private function ctx(): array
    {
        return [
            'session_id' => str_repeat('a', 16),
            'nonce' => str_repeat('b', 64),
            'attestor_version' => '1.0.3',
            'client_pubkey_fpr' => 'sha256:' . str_repeat('c', 64),
        ];
    }

    /** @return array{commitment:array<string,mixed>,commitment_hash:string,signature:string,header:string} */
    private function issue(): array
    {
        return $this->app->commitments->issue($this->bundle, $this->ctx());
    }

    public function testSignAndVerifyRoundTrip(): void // T2.2.1
    {
        $issued = $this->issue();
        $this->assertTrue($this->app->commitments->verify($issued));
        $this->assertSame('server_commitment', $issued['commitment']['type']);
        $this->assertSame($this->bundle->hash, $issued['commitment']['bundle_hash']);
        $this->assertSame('test-k1', $issued['commitment']['key_id']);
    }

    public function testCommitmentCarriesEveryFieldOfTheDesignSchema(): void
    {
        $keys = array_keys($this->issue()['commitment']);
        sort($keys);
        $expected = ['v', 'type', 'session_id', 'bundle_id', 'bundle_hash', 'attestor_hash', 'attestor_version',
            'region_policy', 'nonce', 'issued_at', 'expires_at', 'client_pubkey_fpr', 'log_leaf_index', 'key_id'];
        sort($expected);
        $this->assertSame($expected, $keys);
    }

    public function testEveryFieldIsTamperEvident(): void // T2.2.2
    {
        $issued = $this->issue();
        foreach (array_keys($issued['commitment']) as $field) {
            $tampered = $issued;
            $tampered['commitment'][$field] = is_string($issued['commitment'][$field])
                ? $issued['commitment'][$field] . 'x'
                : 12345;
            unset($tampered['commitment_hash']);
            $this->assertFalse($this->app->commitments->verify($tampered), "field {$field} must be covered");
        }
    }

    public function testTamperedHashFieldAloneIsDetected(): void
    {
        $issued = $this->issue();
        $issued['commitment_hash'] = 'sha256:' . str_repeat('0', 64);
        $this->assertFalse($this->app->commitments->verify($issued));
    }

    public function testWrongKeyFails(): void // T2.2.3
    {
        $issued = $this->issue();
        $other = new KeyStore('test-k1', str_repeat("\x08", 32));
        $this->assertFalse((new Signer($other))->verify(
            Jcs::encode($issued['commitment']),
            $issued['signature'],
            'test-k1'
        ));
    }

    public function testIndependentVerifierNeedsOnlyThePublishedPublicKey(): void
    {
        $issued = $this->issue();
        $published = (new Kernel($this->app))->handle(new \Mra\Http\Request('GET', '/.well-known/mra-key'))->data();
        $this->assertTrue(Signer::verifyWithPublicKey(
            Jcs::encode($issued['commitment']),
            $issued['signature'],
            $published['keys'][0]['public_key']
        ));
    }

    public function testPublicKeyEndpointServesTheMatchingKey(): void // T2.2.4
    {
        $res = (new Kernel($this->app))->handle(new \Mra\Http\Request('GET', '/.well-known/mra-key'));
        $this->assertSame(200, $res->status);
        $key = $res->data()['keys'][0];
        $this->assertSame('test-k1', $key['key_id']);
        $this->assertSame('current', $key['status']);
        $this->assertSame(bin2hex($this->app->keys->publicKey('test-k1')), $key['public_key']);
        $this->assertSame(64, strlen($key['public_key']));
    }

    public function testPrivateKeyIsNeverExposed(): void // T2.2.5
    {
        $seedHex = bin2hex(str_repeat("\x07", 32));
        $pair = sodium_crypto_sign_seed_keypair(str_repeat("\x07", 32));
        $secretHex = bin2hex(sodium_crypto_sign_secretkey($pair));
        $issued = $this->issue();
        $kernel = new Kernel($this->app);
        $res = $kernel->handle(new \Mra\Http\Request('GET', '/.well-known/mra-key'));
        $surface = $res->body . json_encode($issued) . json_encode($res->headers);
        foreach ($this->pdo->query('SELECT * FROM mra_commitment')->fetchAll() as $row) {
            $surface .= json_encode($row);
        }
        foreach (['audit_log', 'security_log'] as $table) {
            $surface .= json_encode($this->pdo->query("SELECT * FROM {$table}")->fetchAll(), JSON_INVALID_UTF8_SUBSTITUTE);
        }
        foreach ([$seedHex, $secretHex, base64_encode(str_repeat("\x07", 32))] as $secret) {
            $this->assertStringNotContainsString($secret, $surface);
        }
    }

    public function testCommitmentHashIsStable(): void // T2.2.6
    {
        $issued = $this->issue();
        $canonical = Jcs::encode($issued['commitment']);
        $this->assertSame(CommitmentService::hash($canonical), CommitmentService::hash($canonical));
        $this->assertSame($issued['commitment_hash'], CommitmentService::hash($canonical));
        $this->assertSame('sha256:' . hash('sha256', $canonical), $issued['commitment_hash']);
    }

    public function testSignatureIsDeterministicForIdenticalInputs(): void
    {
        $signer = new Signer(new KeyStore('k', str_repeat("\x09", 32)));
        $this->assertSame($signer->sign('same message'), $signer->sign('same message'));
        $this->assertNotSame($signer->sign('same message'), $signer->sign('other message'));
    }

    public function testHeaderIsPresentAndParseable(): void // T2.2.7 (encoding half; delivery is tested with the endpoint)
    {
        $issued = $this->issue();
        $parsed = CommitmentService::decodeHeader($issued['header']);
        $this->assertNotNull($parsed);
        $this->assertEquals($issued['commitment'], $parsed['commitment']);
        $this->assertTrue($this->app->commitments->verify($parsed));
        $this->assertSame(1, preg_match('/^[A-Za-z0-9_-]+$/', $issued['header']), 'header-safe characters only');
        $this->assertLessThan(2048, strlen($issued['header']));
    }

    public function testGarbageHeadersDoNotParse(): void
    {
        foreach (['', '!!!', 'bm90LWpzb24', Signer::b64('[1,2')] as $bad) {
            $this->assertNull(CommitmentService::decodeHeader($bad));
        }
    }

    public function testKeyRotationKeepsOldCommitmentsVerifiable(): void // T2.2.8
    {
        $old = new KeyStore('k1', str_repeat("\x01", 32));
        $svc1 = new CommitmentService(new Signer($old), new CommitmentRepository($this->pdo), $this->clock);
        $issued = $svc1->issue($this->bundle, $this->ctx());

        $rotated = new KeyStore('k2', str_repeat("\x02", 32), ['k1' => $old->publicKey('k1')]);
        $svc2 = new CommitmentService(new Signer($rotated), new CommitmentRepository($this->pdo), $this->clock);
        $this->assertTrue($svc2->verify($issued), 'resolved through key_id after rotation');
        $this->assertSame('k2', $svc2->issue($this->bundle, ['nonce' => str_repeat('d', 64)] + $this->ctx())['commitment']['key_id']);

        $statuses = array_column($rotated->publicKeys(), 'status', 'key_id');
        $this->assertSame(['k2' => 'current', 'k1' => 'retired'], $statuses);
    }

    public function testRotationWithoutTheRetiredKeyFailsClosed(): void
    {
        $old = new KeyStore('k1', str_repeat("\x01", 32));
        $issued = (new CommitmentService(new Signer($old), new CommitmentRepository($this->pdo), $this->clock))
            ->issue($this->bundle, $this->ctx());
        $rotatedWithoutHistory = new KeyStore('k2', str_repeat("\x02", 32));
        $svc = new CommitmentService(new Signer($rotatedWithoutHistory), new CommitmentRepository($this->pdo), $this->clock);
        $this->assertFalse($svc->verify($issued));
    }

    public function testExpiryIsIssuedPlusValidityWindow(): void
    {
        $c = $this->issue()['commitment'];
        $this->assertSame('2026-10-03T12:00:00Z', $c['issued_at']);
        $this->assertSame('2026-10-03T12:15:00Z', $c['expires_at']);
        $custom = $this->app->commitments->issue($this->bundle, ['validity_minutes' => 60, 'nonce' => 'n2'] + $this->ctx());
        $this->assertSame('2026-10-03T13:00:00Z', $custom['commitment']['expires_at']);
    }

    public function testValidityWindowIsRangeChecked(): void
    {
        foreach ([0, 61, -1] as $bad) {
            try {
                $this->app->commitments->issue($this->bundle, ['validity_minutes' => $bad] + $this->ctx());
                $this->fail("{$bad} should be refused");
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function testCommitmentIsPersistedAndRecomputable(): void
    {
        $issued = $this->issue();
        $row = (new CommitmentRepository($this->pdo))->findByHash($issued['commitment_hash']);
        $this->assertNotNull($row);
        $this->assertSame($issued['commitment_hash'], CommitmentService::hash($row['commitment_blob']));
        $this->assertSame($issued['signature'], $row['signature']);
    }

    public function testKeyStoreRejectsBadInputs(): void
    {
        foreach ([['bad id!', str_repeat('x', 32)], ['ok', 'short']] as [$id, $seed]) {
            try {
                new KeyStore($id, $seed);
                $this->fail('expected refusal');
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function testMalformedSignaturesFailClosed(): void
    {
        $signer = new Signer($this->app->keys);
        foreach (['', '***', 'AAAA', Signer::b64(str_repeat('x', 63))] as $bad) {
            $this->assertFalse($signer->verify('m', $bad, 'test-k1'));
        }
        $this->assertFalse($signer->verify('m', $signer->sign('m'), 'unknown-key'));
    }
}
