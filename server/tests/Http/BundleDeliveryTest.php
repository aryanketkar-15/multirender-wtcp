<?php

declare(strict_types=1);

namespace Mra\Tests\Http;

use Mra\App;
use Mra\Crypto\Jcs;
use Mra\Http\Kernel;
use Mra\Http\Response;
use Mra\Service\BundleBuilder;
use Mra\Service\CommitmentService;
use Mra\Service\SessionService;
use Mra\Tests\TestCase;

final class BundleDeliveryTest extends TestCase
{
    private const FPR = 'sha256:' . '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    private App $app;
    private Kernel $kernel;
    private int $userId;
    private int $adminId;
    private int $unverifiedId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->app = $this->makeApp();
        $this->kernel = new Kernel($this->app);
        $this->userId = $this->app->users->create('user@example.com', 'User', 'h');
        $this->app->users->markVerified($this->userId);
        $this->adminId = $this->app->users->create('admin@example.com', 'Admin', 'h');
        $this->app->users->markVerified($this->adminId);
        $this->app->users->setAdmin($this->adminId, true);
        $this->unverifiedId = $this->app->users->create('new@example.com', 'New', 'h');
    }

    /** @return array{token:string,csrf:string} */
    private function sessionFor(int $userId): array
    {
        $made = $this->app->sessions->create($userId);
        return ['token' => $made['token'], 'csrf' => $made['session']->csrfToken];
    }

    /** @param array<string,mixed> $body */
    private function send(string $method, string $path, ?array $s, array $body = []): Response
    {
        return $this->call(
            $this->kernel,
            $method,
            $path,
            $body,
            '198.51.100.60',
            $s === null ? [] : ['x-csrf-token' => $s['csrf']],
            $s === null ? [] : [SessionService::COOKIE => $s['token']]
        );
    }

    /** @param array{token:string,csrf:string} $s */
    private function bundle(array $s): Response
    {
        $this->assertSame(200, $this->send('POST', '/api/client-key', $s, ['fingerprint' => self::FPR])->status);
        return $this->send('GET', '/api/bundle', $s);
    }

    public function testBundleIsDeliveredWithTheCommitmentHeader(): void // T2.3.1 + T2.2.7
    {
        $res = $this->bundle($this->sessionFor($this->userId));
        $this->assertSame(200, $res->status);
        $header = CommitmentService::decodeHeader($res->headers['X-MRA-Commitment']);
        $this->assertNotNull($header, 'X-MRA-Commitment is present and parseable');
        $this->assertTrue($this->app->commitments->verify($header));
        $data = $res->data();
        $this->assertEquals($data['commitment'], $header['commitment']);
        $this->assertSame($data['bundle_hash'], $header['commitment']['bundle_hash']);
        $this->assertSame($data['nonce'], $header['commitment']['nonce']);
        $this->assertSame(self::FPR, $header['commitment']['client_pubkey_fpr']);
    }

    public function testDeliveredBundleHashesToTheCommittedValue(): void
    {
        $data = $this->bundle($this->sessionFor($this->userId))->data();
        $canonical = Jcs::encode($data['bundle']);
        $this->assertSame($data['bundle_hash'], BundleBuilder::hashOf($canonical));
        $this->assertSame($data['commitment']['bundle_hash'], BundleBuilder::hashOf($canonical));
    }

    public function testBundleAndCommitmentAreStoredBeforeInteractionIsPossible(): void
    {
        $data = $this->bundle($this->sessionFor($this->userId))->data();
        $this->assertSame($data['bundle_hash'], $this->app->bundles->hashOf($data['bundle']['bundle_id']));
        $stored = $this->pdo->prepare('SELECT 1 FROM mra_commitment WHERE commitment_hash = ?');
        $stored->execute([$data['commitment_hash']]);
        $this->assertSame(1, (int) $stored->fetchColumn());
    }

    public function testCriticalRegionHoldsDisclosureAcceptAndRejectAndIsNeverPreTicked(): void
    {
        $markup = $this->bundle($this->sessionFor($this->userId))->data()['bundle']['markup'];
        $this->assertStringContainsString('id="disclosure"', $markup);
        $this->assertStringContainsString('id="btn-agree"', $markup);
        $this->assertStringContainsString('id="btn-reject"', $markup);
        $this->assertStringNotContainsString('checked', $markup);
    }

    public function testUnauthenticatedCallerIsDenied(): void // T2.3.2
    {
        $this->assertSame(401, $this->send('GET', '/api/bundle', null)->status);
    }

    public function testUnverifiedUserIsDenied(): void // T2.3.3
    {
        $s = $this->sessionFor($this->unverifiedId);
        $res = $this->send('GET', '/api/bundle', $s);
        $this->assertSame(403, $res->status);
        $this->assertSame(403, $this->send('POST', '/api/client-key', $s, ['fingerprint' => self::FPR])->status);
    }

    public function testBundleRequiresARegisteredClientKey(): void
    {
        $res = $this->send('GET', '/api/bundle', $this->sessionFor($this->userId));
        $this->assertSame(409, $res->status);
        $this->assertSame('client_key_required', $res->data()['error']);
    }

    public function testMalformedFingerprintsAreRejected(): void
    {
        $s = $this->sessionFor($this->userId);
        foreach (['', 'abc', 'sha256:xyz', 'sha1:' . str_repeat('a', 40), 'sha256:' . str_repeat('A', 64)] as $bad) {
            $this->assertSame(422, $this->send('POST', '/api/client-key', $s, ['fingerprint' => $bad])->status, $bad);
        }
    }

    public function testClientKeyRegistrationNeedsCsrf(): void
    {
        $s = $this->sessionFor($this->userId);
        $res = $this->call(
            $this->kernel,
            'POST',
            '/api/client-key',
            ['fingerprint' => self::FPR],
            '198.51.100.60',
            [],
            [SessionService::COOKIE => $s['token']]
        );
        $this->assertSame(403, $res->status);
    }

    public function testEachRequestGetsADistinctNonceAndCommitment(): void // T2.3.4 over HTTP
    {
        $s = $this->sessionFor($this->userId);
        $this->send('POST', '/api/client-key', $s, ['fingerprint' => self::FPR]);
        $a = $this->send('GET', '/api/bundle', $s)->data();
        $b = $this->send('GET', '/api/bundle', $s)->data();
        $this->assertNotSame($a['nonce'], $b['nonce']);
        $this->assertNotSame($a['commitment_hash'], $b['commitment_hash']);
        $this->assertSame($a['bundle_hash'], $b['bundle_hash'], 'same settings, same sealed bundle');
    }

    public function testIssuedNonceIsBoundToTheRequestingSession(): void // T2.3.5 over HTTP
    {
        $a = $this->sessionFor($this->userId);
        $b = $this->sessionFor($this->userId);
        $data = $this->bundle($a)->data();
        $sessionA = $this->app->sessions->resolve($a['token'])->id;
        $sessionB = $this->app->sessions->resolve($b['token'])->id;
        $this->assertFalse($this->app->nonces->consume($data['nonce'], $sessionB));
        $this->assertTrue($this->app->nonces->consume($data['nonce'], $sessionA));
    }

    public function testCommitmentExpiryFollowsTheConfiguredValidityWindow(): void
    {
        $s = $this->sessionFor($this->adminId);
        $this->send('POST', '/api/admin/consent', $s, $this->settings(['validity_minutes' => 5]));
        $this->send('POST', '/api/client-key', $s, ['fingerprint' => self::FPR]);
        $c = $this->send('GET', '/api/bundle', $s)->data()['commitment'];
        $this->assertSame('2026-10-03T12:05:00Z', $c['expires_at']);
    }

    public function testIssuanceIsAudited(): void
    {
        $this->bundle($this->sessionFor($this->userId));
        $this->assertSame(1, (int) $this->pdo->query("SELECT COUNT(*) FROM audit_log WHERE action = 'bundle.issued'")->fetchColumn());
    }

    /**
     * @param array<string,mixed> $override
     * @return array<string,mixed>
     */
    private function settings(array $override = []): array
    {
        return $override + [
            'disclosure_text' => 'We share your data with partners.',
            'accept_label' => 'Accept',
            'reject_label' => 'Reject',
            'validity_minutes' => 15,
            'retention_days' => 365,
        ];
    }

    public function testAdminEditProducesANewBundleHash(): void // basis of T2.4.7
    {
        $admin = $this->sessionFor($this->adminId);
        $before = $this->bundle($admin)->data()['bundle_hash'];
        $res = $this->send('POST', '/api/admin/consent', $admin, $this->settings(['disclosure_text' => 'A different notice.']));
        $this->assertSame(200, $res->status);
        $this->assertNotSame($before, $this->send('GET', '/api/bundle', $admin)->data()['bundle_hash']);
        $this->assertStringContainsString('A different notice.', $this->send('GET', '/api/bundle', $admin)->body);
    }

    public function testAdminSettingsAreRangeValidatedOnTheServer(): void
    {
        $admin = $this->sessionFor($this->adminId);
        $cases = [
            ['validity_minutes' => 0], ['validity_minutes' => 61], ['retention_days' => 0],
            ['retention_days' => 3651], ['disclosure_text' => ''],
        ];
        foreach ($cases as $bad) {
            $res = $this->send('POST', '/api/admin/consent', $admin, $this->settings($bad));
            $this->assertSame(422, $res->status, json_encode($bad));
            $this->assertArrayHasKey(array_key_first($bad), $res->data()['fields']);
        }
        $edge = $this->settings(['validity_minutes' => 60, 'retention_days' => 3650]);
        $this->assertSame(200, $this->send('POST', '/api/admin/consent', $admin, $edge)->status);
    }

    public function testOrdinaryUsersCannotReachAdminRoutes(): void
    {
        $s = $this->sessionFor($this->userId);
        $this->assertSame(403, $this->send('GET', '/api/admin/consent', $s)->status);
        $this->assertSame(403, $this->send('POST', '/api/admin/consent', $s, $this->settings(['disclosure_text' => 'hijack']))->status);
        $this->assertSame(401, $this->send('GET', '/api/admin/consent', null)->status);
        $denied = $this->pdo->query("SELECT COUNT(*) FROM security_log WHERE event_type = 'admin.denied'");
        $this->assertSame(2, (int) $denied->fetchColumn());
        $this->assertStringNotContainsString('hijack', $this->send('GET', '/api/admin/consent', $this->sessionFor($this->adminId))->body);
    }

    public function testSettingsAreHtmlEscapedIntoTheSealedMarkup(): void
    {
        $admin = $this->sessionFor($this->adminId);
        $this->send('POST', '/api/admin/consent', $admin, $this->settings(['disclosure_text' => '<img src=x onerror=alert(1)> & more']));
        $markup = $this->bundle($admin)->data()['bundle']['markup'];
        $this->assertStringNotContainsString('<img', $markup);
        $this->assertStringContainsString('&lt;img', $markup);
    }
}
