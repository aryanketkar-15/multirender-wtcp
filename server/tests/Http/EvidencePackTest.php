<?php

declare(strict_types=1);

namespace Mra\Tests\Http;

use Mra\App;
use Mra\Config\Env;
use Mra\Crypto\Jcs;
use Mra\Http\Kernel;
use Mra\Http\Response;
use Mra\Service\EvidencePackBuilder;
use Mra\Service\SessionService;
use Mra\Tests\Support\ClientSimulator;
use Mra\Tests\TestCase;
use ZipArchive;

final class EvidencePackTest extends TestCase
{
    private App $app;
    private Kernel $kernel;
    private ClientSimulator $client;
    private int $aliceId;
    private int $bobId;
    /** @var array{token:string,csrf:string} */
    private array $alice;
    /** @var array{token:string,csrf:string} */
    private array $bob;

    protected function setUp(): void
    {
        parent::setUp();
        Env::set('ATTESTOR_BASE_URL', 'http://attestor.test');
        $this->app = $this->makeApp();
        $this->kernel = new Kernel($this->app);
        $this->app->attestors->register([
            'version' => '1.0.0',
            'file' => 'mra-attestor-1.0.0.js',
            'sha384' => 'sha384-' . str_repeat('A', 64),
            'sha256' => 'sha256:' . str_repeat('c', 64),
        ]);
        $this->client = ClientSimulator::create();

        $this->aliceId = $this->app->users->create('alice.pack@example.com', 'Alice Pack', 'h');
        $this->app->users->markVerified($this->aliceId);
        $this->alice = $this->session($this->aliceId);

        $this->bobId = $this->app->users->create('bob.pack@example.com', 'Bob Pack', 'h');
        $this->app->users->markVerified($this->bobId);
        $this->bob = $this->session($this->bobId);
    }

    /** @return array{token:string,csrf:string} */
    private function session(int $userId): array
    {
        $made = $this->app->sessions->create($userId);
        return ['token' => $made['token'], 'csrf' => $made['session']->csrfToken];
    }

    /** @param array{token:string,csrf:string}|null $s */
    private function send(string $method, string $path, array $body = [], ?array $s = null, array $headers = []): Response
    {
        $cookies = $s === null ? [] : [SessionService::COOKIE => $s['token']];
        $allHeaders = $headers;
        if ($s !== null && !isset($allHeaders['x-csrf-token'])) {
            $allHeaders['x-csrf-token'] = $s['csrf'];
        }
        return $this->call($this->kernel, $method, $path, $body, '198.51.100.99', $allHeaders, $cookies);
    }

    /** Completes consent attestation for a user and returns the pack id. */
    private function completeAttestation(array $s, ?ClientSimulator $client = null): string
    {
        $client ??= $this->client;
        $keyRes = $this->send('POST', '/api/client-key', ['fingerprint' => $client->fingerprint], $s);
        $this->assertSame(200, $keyRes->status);

        $bundleRes = $this->send('GET', '/api/bundle', [], $s);
        $this->assertSame(200, $bundleRes->status);
        $bundle = $bundleRes->data();

        $attestationBody = $client->body($bundle, 'accept');
        $attestRes = $this->send('POST', '/api/attest', $attestationBody, $s);
        $this->assertSame(201, $attestRes->status);

        $packId = $attestRes->data()['pack_id'] ?? null;
        $this->assertIsString($packId);
        $this->assertNotEmpty($packId);
        return $packId;
    }

    /** @return array<string,string> filename => string contents */
    private function extractZip(string $binary): array
    {
        $tmp = tempnam(sys_get_temp_dir(), 'test_zip_');
        file_put_contents($tmp, $binary);
        $zip = new ZipArchive();
        $this->assertTrue($zip->open($tmp), 'Valid ZIP archive');

        $files = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            $files[$stat['name']] = $zip->getFromIndex($i);
        }
        $zip->close();
        @unlink($tmp);
        return $files;
    }

    public function testPackDownloadsAsValidZipWithAllComponents(): void // T5.1.1
    {
        $packId = $this->completeAttestation($this->alice);

        $res = $this->send('GET', "/api/pack/{$packId}/download", [], $this->alice);
        $this->assertSame(200, $res->status);
        $this->assertSame('application/zip', $res->headers['Content-Type'] ?? null);

        $files = $this->extractZip($res->body);
        $expectedFiles = [
            'manifest.json',
            'bundle.json',
            'commitment.json',
            'attestation.json',
            'client_pubkey.pem',
            'inclusion_proof_commitment.json',
            'inclusion_proof_attestation.json',
            'signed_tree_head.json',
        ];

        foreach ($expectedFiles as $expected) {
            $this->assertArrayHasKey($expected, $files, "File {$expected} present in ZIP");
            $this->assertNotEmpty($files[$expected], "File {$expected} is non-empty");
        }
    }

    public function testPackIsSelfContainedAndOfflineVerifiable(): void // T5.1.2
    {
        $packId = $this->completeAttestation($this->alice);

        $res = $this->send('GET', "/api/pack/{$packId}/download", [], $this->alice);
        $files = $this->extractZip($res->body);

        $manifest = json_decode($files['manifest.json'], true);
        $this->assertIsArray($manifest);
        $this->assertSame($packId, $manifest['pack_id']);

        $bundle = json_decode($files['bundle.json'], true);
        $this->assertIsArray($bundle);
        $bundleHash = 'sha256:' . hash('sha256', Jcs::encode($bundle));
        $this->assertSame($manifest['hashes']['bundle_hash'], $bundleHash);

        $commitment = json_decode($files['commitment.json'], true);
        $this->assertIsArray($commitment);
        $commitmentHash = 'sha256:' . hash('sha256', Jcs::encode($commitment['record']));
        $this->assertSame($manifest['hashes']['commitment_hash'], $commitmentHash);

        $attestation = json_decode($files['attestation.json'], true);
        $this->assertIsArray($attestation);
        $attestationHash = 'sha256:' . hash('sha256', Jcs::encode($attestation['record']));
        $this->assertSame($manifest['hashes']['attestation_hash'], $attestationHash);
        $this->assertSame($commitmentHash, $attestation['record']['commitment_hash']);

        // Client public key PEM matches the key embedded in attestation
        $this->assertStringContainsString('BEGIN PUBLIC KEY', $files['client_pubkey.pem']);
        $this->assertSame(trim($files['client_pubkey.pem']), trim($attestation['record']['client_pubkey']));

        // Inclusion proofs are present and reference the tree size
        $proofC = json_decode($files['inclusion_proof_commitment.json'], true);
        $proofA = json_decode($files['inclusion_proof_attestation.json'], true);
        $this->assertLessThan($proofA['leaf_index'], $proofC['leaf_index']);
        $this->assertSame($manifest['tree']['tree_size'], $proofC['tree_size']);
        $this->assertSame($manifest['tree']['tree_size'], $proofA['tree_size']);

        // Signed tree head
        $head = json_decode($files['signed_tree_head.json'], true);
        $this->assertSame($manifest['tree']['root_hash'], $head['record']['root_hash']);
        $this->assertNotEmpty($head['signature']);
    }

    public function testCrossSubjectPackDownloadIsDeniedAndLogged(): void // T5.1.3
    {
        $packId = $this->completeAttestation($this->bob);

        $initialDenials = (int) $this->pdo->query(
            "SELECT COUNT(*) FROM security_log WHERE event_type = 'authz.cross_subject_denied'"
        )->fetchColumn();

        $res = $this->send('GET', "/api/pack/{$packId}/download", [], $this->alice);
        $this->assertSame(403, $res->status);

        $afterDenials = (int) $this->pdo->query(
            "SELECT COUNT(*) FROM security_log WHERE event_type = 'authz.cross_subject_denied'"
        )->fetchColumn();
        $this->assertSame($initialDenials + 1, $afterDenials);
    }

    public function testUnauthenticatedPackRequestIsDenied(): void // T5.1.4
    {
        $packId = $this->completeAttestation($this->alice);

        $showRes = $this->send('GET', "/api/pack/{$packId}", [], null);
        $this->assertSame(401, $showRes->status);

        $dlRes = $this->send('GET', "/api/pack/{$packId}/download", [], null);
        $this->assertSame(401, $dlRes->status);
    }

    public function testManifestCarriesSchemaVersion(): void // T5.1.5
    {
        $packId = $this->completeAttestation($this->alice);

        $res = $this->send('GET', "/api/pack/{$packId}/download", [], $this->alice);
        $files = $this->extractZip($res->body);
        $manifest = json_decode($files['manifest.json'], true);

        $this->assertArrayHasKey('schema_version', $manifest);
        $this->assertSame(EvidencePackBuilder::SCHEMA_VERSION, $manifest['schema_version']);
    }

    public function testPackDownloadIsAudited(): void // T5.1.6
    {
        $packId = $this->completeAttestation($this->alice);

        $beforeAudits = (int) $this->pdo->query(
            "SELECT COUNT(*) FROM audit_log WHERE action = 'pack.downloaded' AND target_id = '{$packId}'"
        )->fetchColumn();

        $res = $this->send('GET', "/api/pack/{$packId}/download", [], $this->alice);
        $this->assertSame(200, $res->status);

        $afterAudits = (int) $this->pdo->query(
            "SELECT COUNT(*) FROM audit_log WHERE action = 'pack.downloaded' AND target_id = '{$packId}'"
        )->fetchColumn();
        $this->assertSame($beforeAudits + 1, $afterAudits);
    }

    public function testNonexistentPackReturns404(): void // T5.1.7
    {
        $res = $this->send('GET', '/api/pack/pack-nonexistent-12345', [], $this->alice);
        $this->assertSame(404, $res->status);

        $dlRes = $this->send('GET', '/api/pack/pack-nonexistent-12345/download', [], $this->alice);
        $this->assertSame(404, $dlRes->status);
    }

    public function testPackListAndMetadata(): void
    {
        // Initially empty for a fresh user
        $freshUser = $this->app->users->create('fresh@example.com', 'Fresh', 'h');
        $freshSession = $this->session($freshUser);
        $emptyListRes = $this->send('GET', '/api/pack', [], $freshSession);
        $this->assertSame(200, $emptyListRes->status);
        $this->assertSame([], $emptyListRes->data()['packs']);

        // Now Alice has a pack
        $packId = $this->completeAttestation($this->alice);
        $listRes = $this->send('GET', '/api/pack', [], $this->alice);
        $this->assertSame(200, $listRes->status);
        $packs = $listRes->data()['packs'];
        $this->assertNotEmpty($packs);
        $this->assertSame($packId, $packs[0]['id']);

        // Metadata endpoint
        $showRes = $this->send('GET', "/api/pack/{$packId}", [], $this->alice);
        $this->assertSame(200, $showRes->status);
        $this->assertSame($packId, $showRes->data()['pack_id']);
        $this->assertSame('accept', $showRes->data()['action']);
        $this->assertSame("/api/pack/{$packId}/download", $showRes->data()['download_url']);
    }
}
