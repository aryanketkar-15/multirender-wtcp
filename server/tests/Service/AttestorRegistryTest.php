<?php

declare(strict_types=1);

namespace Mra\Tests\Service;

use InvalidArgumentException;
use Mra\App;
use Mra\Config\Env;
use Mra\Http\Kernel;
use Mra\Service\CommitmentService;
use Mra\Service\SessionService;
use Mra\Tests\TestCase;

final class AttestorRegistryTest extends TestCase
{
    private const FPR = 'sha256:' . 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321';

    private App $app;

    protected function setUp(): void
    {
        parent::setUp();
        Env::set('ATTESTOR_BASE_URL', 'http://attestor.test:8090/');
        $this->app = $this->makeApp();
    }

    /** @return array{version:string,file:string,sha384:string,sha256:string} */
    private function manifest(string $version = '1.0.0', string $fill = 'a'): array
    {
        return [
            'version' => $version,
            'file' => "mra-attestor-{$version}.js",
            'sha384' => 'sha384-' . str_repeat('A', 64),
            'sha256' => 'sha256:' . str_repeat($fill, 64),
        ];
    }

    public function testKnownHashIsRecognisedAsActive(): void // T3.5.5
    {
        $this->app->attestors->register($this->manifest());
        $row = $this->app->attestors->find('sha256:' . str_repeat('a', 64));
        $this->assertSame('active', $row['status']);
        $this->assertSame('1.0.0', $row['version']);
        $this->assertTrue($this->app->attestors->isRecognised('sha256:' . str_repeat('a', 64)));
    }

    public function testUnknownHashIsNotRecognised(): void // T3.5.6
    {
        $this->app->attestors->register($this->manifest());
        $unknown = 'sha256:' . str_repeat('b', 64);
        $this->assertNull($this->app->attestors->find($unknown));
        $this->assertFalse($this->app->attestors->isRecognised($unknown));
        $this->assertFalse($this->app->attestors->isRecognised($unknown, true));
    }

    public function testRegistrationIsIdempotent(): void
    {
        $this->app->attestors->register($this->manifest());
        $this->app->attestors->register($this->manifest());
        $this->assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM attestor_registry')->fetchColumn());
    }

    public function testDeprecatedBuildVerifiesOldEvidenceButIsNotChosenForNewCommitments(): void
    {
        $this->app->attestors->register($this->manifest('1.0.0', 'a'));
        $this->app->attestors->register($this->manifest('1.1.0', 'b'));
        $this->assertSame('1.1.0', $this->app->attestors->active()['version'], 'latest active wins');

        $this->app->attestors->setStatus('sha256:' . str_repeat('b', 64), 'deprecated');
        $this->assertSame('1.0.0', $this->app->attestors->active()['version']);
        $old = 'sha256:' . str_repeat('b', 64);
        $this->assertNotNull($this->app->attestors->find($old), 'the row is kept');
        $this->assertFalse($this->app->attestors->isRecognised($old));
        $this->assertTrue($this->app->attestors->isRecognised($old, true), 'historical packs still verify');
    }

    public function testRevokedBuildIsNeverRecognised(): void
    {
        $this->app->attestors->register($this->manifest());
        $hash = 'sha256:' . str_repeat('a', 64);
        $this->app->attestors->setStatus($hash, 'revoked');
        $this->assertFalse($this->app->attestors->isRecognised($hash, true));
        $this->assertNull($this->app->attestors->active());
    }

    public function testMalformedManifestsAreRefused(): void
    {
        $bad = [
            ['version' => 'one'],
            ['sha256' => 'sha256:xyz'],
            ['sha384' => 'sha384-short'],
            ['file' => '../evil.js'],
            ['file' => 'x.php'],
        ];
        foreach ($bad as $override) {
            try {
                $this->app->attestors->register($override + $this->manifest());
                $this->fail('expected refusal: ' . json_encode($override));
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
        $this->expectException(InvalidArgumentException::class);
        $this->app->attestors->setStatus('sha256:' . str_repeat('a', 64), 'banana');
    }

    public function testTheRealReleaseManifestRegisters(): void
    {
        $path = __DIR__ . '/../../../attestor/dist/manifest.json';
        if (!is_file($path)) {
            $this->markTestSkipped('no attestor release has been built');
        }
        $manifest = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        $this->app->attestors->register($manifest);
        $this->assertTrue($this->app->attestors->isRecognised($manifest['sha256']));
    }

    /** @return array{token:string,csrf:string} */
    private function verifiedSession(): array
    {
        $user = $this->app->users->findByEmail('att@example.com');
        $id = $user?->id ?? $this->app->users->create('att@example.com', 'Att', 'h');
        $this->app->users->markVerified($id);
        $made = $this->app->sessions->create($id);
        return ['token' => $made['token'], 'csrf' => $made['session']->csrfToken];
    }

    /** @return array<string,mixed> */
    private function bundleResponse(): array
    {
        $kernel = new Kernel($this->app);
        $s = $this->verifiedSession();
        $headers = ['x-csrf-token' => $s['csrf']];
        $cookies = [SessionService::COOKIE => $s['token']];
        $this->call($kernel, 'POST', '/api/client-key', ['fingerprint' => self::FPR], '198.51.100.70', $headers, $cookies);
        $res = $this->call($kernel, 'GET', '/api/bundle', [], '198.51.100.70', $headers, $cookies);
        $this->assertSame(200, $res->status);
        return $res->data();
    }

    public function testCommitmentNamesTheRegisteredAttestorHashAndVersion(): void // T3.5.7
    {
        $this->app->attestors->register($this->manifest('1.0.0', 'c'));
        $data = $this->bundleResponse();
        $this->assertSame('sha256:' . str_repeat('c', 64), $data['commitment']['attestor_hash']);
        $this->assertSame('1.0.0', $data['commitment']['attestor_version']);
        $this->assertSame($data['commitment']['attestor_hash'], $data['bundle']['attestor_hash']);
        $header = CommitmentService::decodeHeader($this->lastHeader);
        $this->assertSame('sha256:' . str_repeat('c', 64), $header['commitment']['attestor_hash']);
    }

    public function testBundleResponseTellsTheBrowserWhatToLoad(): void
    {
        $this->app->attestors->register($this->manifest('1.0.0', 'c'));
        $info = $this->bundleResponse()['attestor'];
        $this->assertSame('http://attestor.test:8090/mra-attestor-1.0.0.js', $info['url']);
        $this->assertSame('sha384-' . str_repeat('A', 64), $info['integrity']);
        $this->assertSame('sha256:' . str_repeat('c', 64), $info['hash']);
        $this->assertSame('1.0.0', $info['version']);
    }

    public function testWithNothingRegisteredTheBrowserIsToldThereIsNoAttestor(): void
    {
        $data = $this->bundleResponse();
        $this->assertNull($data['attestor']);
        $this->assertSame('0.0.0-unregistered', $data['commitment']['attestor_version']);
    }

    public function testChangingTheActiveAttestorChangesTheSealedBundle(): void
    {
        $this->app->attestors->register($this->manifest('1.0.0', 'c'));
        $first = $this->bundleResponse()['bundle_hash'];
        $this->app->attestors->register($this->manifest('1.0.1', 'd'));
        $second = $this->bundleResponse()['bundle_hash'];
        $this->assertNotSame($first, $second, 'the attestor hash is part of what the server commits to');
    }

    private string $lastHeader = '';

    /** Captures the X-MRA-Commitment header of the most recent bundle response. */
    protected function call(
        Kernel $kernel,
        string $method,
        string $path,
        array $body = [],
        string $ip = '198.51.100.1',
        array $headers = [],
        array $cookies = []
    ): \Mra\Http\Response {
        $res = parent::call($kernel, $method, $path, $body, $ip, $headers, $cookies);
        $this->lastHeader = $res->headers[CommitmentService::HEADER] ?? $this->lastHeader;
        return $res;
    }
}
