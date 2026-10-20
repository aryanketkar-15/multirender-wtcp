<?php

declare(strict_types=1);

namespace Mra\Tests\Http;

use Mra\App;
use Mra\Config\Env;
use Mra\Crypto\Jcs;
use Mra\Http\Kernel;
use Mra\Http\Response;
use Mra\Service\SessionService;
use Mra\Tests\Support\ClientSimulator;
use Mra\Tests\TestCase;
use ZipArchive;

/**
 * The unsigned region representation that travels beside a signed attestation: kept only if it is
 * what the signed critical_region_digest is the hash of, and exported in the evidence pack.
 */
final class AttestationRepresentationTest extends TestCase
{
    private App $app;
    private Kernel $kernel;
    private ClientSimulator $client;
    /** @var array{token:string,csrf:string} */
    private array $s;

    protected function setUp(): void
    {
        parent::setUp();
        Env::set('ATTESTOR_BASE_URL', 'http://attestor.test');
        $this->app = $this->makeApp();
        $this->kernel = new Kernel($this->app);
        $this->app->attestors->register([
            'version' => '1.1.0',
            'file' => 'mra-attestor-1.1.0.js',
            'sha384' => 'sha384-' . str_repeat('A', 64),
            'sha256' => 'sha256:' . str_repeat('c', 64),
        ]);
        $this->client = ClientSimulator::create();
        $id = $this->app->users->create('repr@example.com', 'Repr', 'h');
        $this->app->users->markVerified($id);
        $made = $this->app->sessions->create($id);
        $this->s = ['token' => $made['token'], 'csrf' => $made['session']->csrfToken];
    }

    private function send(string $method, string $path, array $body = []): Response
    {
        return $this->call(
            $this->kernel,
            $method,
            $path,
            $body,
            '198.51.100.77',
            ['x-csrf-token' => $this->s['csrf']],
            [SessionService::COOKIE => $this->s['token']]
        );
    }

    /** @return array<string,mixed> */
    private function bundle(): array
    {
        $this->send('POST', '/api/client-key', ['fingerprint' => $this->client->fingerprint]);
        return $this->send('GET', '/api/bundle')->data();
    }

    /** A representation shaped like the Attestor's, with non-ASCII text to exercise canonicalisation. */
    private function representation(): array
    {
        return [
            'v' => 'srd/1.0',
            'policy' => 'consent/v1',
            'nodes' => [
                ['i' => 0, 'role' => 'heading', 'level' => 2, 'text' => 'your consent', 'visible' => true, 'occlusion' => 'clear',
                    'style' => ['size' => 'larger', 'weight' => 'bold', 'contrast' => 'high']],
                ['i' => 1, 'role' => 'paragraph', 'text' => 'we keep records for 365 days — café ✓', 'visible' => true, 'occlusion' => 'clear',
                    'style' => ['size' => 'base', 'weight' => 'normal', 'contrast' => 'high']],
                ['i' => 2, 'role' => 'checkbox', 'name' => 'i agree', 'checked' => true, 'required' => false, 'visible' => true, 'occlusion' => 'clear'],
            ],
        ];
    }

    private function digestOf(array $representation): string
    {
        return 'sha256:' . hash('sha256', Jcs::encode($representation));
    }

    /** @return array<string,string> */
    private function zipFiles(string $binary): array
    {
        $tmp = tempnam(sys_get_temp_dir(), 'repr_zip_');
        file_put_contents($tmp, $binary);
        $zip = new ZipArchive();
        $this->assertTrue($zip->open($tmp));
        $files = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $files[$zip->statIndex($i)['name']] = $zip->getFromIndex($i);
        }
        $zip->close();
        @unlink($tmp);
        return $files;
    }

    public function testARepresentationThatHashesToTheSignedDigestIsStoredAndExported(): void
    {
        $b = $this->bundle();
        $rep = $this->representation();
        $body = $this->client->body($b, 'accept', ['critical_region_digest' => $this->digestOf($rep)]);
        $res = $this->send('POST', '/api/attest', $body + ['region_representation' => $rep]);
        $this->assertSame(201, $res->status);

        $stored = $this->app->attestations->representationFor((int) $res->data()['attestation_id']);
        $this->assertSame(Jcs::encode($rep), $stored, 'the exact canonical text is stored');

        $pack = $this->send('GET', '/api/pack/' . $res->data()['pack_id'] . '/download');
        $files = $this->zipFiles($pack->body);
        $this->assertArrayHasKey('representation.json', $files);
        $this->assertSame($body['attestation']['critical_region_digest'], 'sha256:' . hash('sha256', $files['representation.json']));
        $manifest = json_decode($files['manifest.json'], true);
        $this->assertSame('representation.json', $manifest['components']['region_representation']);
    }

    public function testARepresentationThatDoesNotMatchTheSignedDigestIsRefusedAndTheNonceSurvives(): void
    {
        $b = $this->bundle();
        $rep = $this->representation();
        $body = $this->client->body($b, 'accept', ['critical_region_digest' => $this->digestOf($rep)]);

        $forged = $rep;
        $forged['nodes'][1]['text'] = 'we never share your data';
        $res = $this->send('POST', '/api/attest', $body + ['region_representation' => $forged]);
        $this->assertSame(422, $res->status);
        $this->assertSame('REPRESENTATION_MISMATCH', $res->data()['error']);
        $this->assertSame(0, $this->app->attestations->count(), 'nothing was written');

        // The signature is untouched and the nonce unspent: the honest representation still works.
        $retry = $this->send('POST', '/api/attest', $body + ['region_representation' => $rep]);
        $this->assertSame(201, $retry->status);
    }

    public function testAMalformedRepresentationIsRejectedByTheSchema(): void
    {
        $b = $this->bundle();
        $cases = [
            'a list' => [1, 2],
            'wrong version' => ['v' => 'srd/9', 'policy' => 'consent/v1', 'nodes' => []],
            'extra member' => ['v' => 'srd/1.0', 'policy' => 'consent/v1', 'nodes' => [], 'extra' => 1],
            'node not an object' => ['v' => 'srd/1.0', 'policy' => 'consent/v1', 'nodes' => ['x']],
            'nodes not a list' => ['v' => 'srd/1.0', 'policy' => 'consent/v1', 'nodes' => ['a' => []]],
        ];
        foreach ($cases as $label => $bad) {
            $res = $this->send('POST', '/api/attest', $this->client->body($b) + ['region_representation' => $bad]);
            $this->assertSame(422, $res->status, $label);
            $this->assertSame('SCHEMA_INVALID', $res->data()['error'], $label);
        }
        $this->assertSame(0, $this->app->attestations->count());
    }

    public function testAnOversizedRepresentationIsRefused(): void
    {
        $b = $this->bundle();
        $rep = ['v' => 'srd/1.0', 'policy' => 'consent/v1', 'nodes' => [['i' => 0, 'role' => 'paragraph', 'text' => str_repeat('a', 300000)]]];
        $body = $this->client->body($b, 'accept', ['critical_region_digest' => $this->digestOf($rep)]);
        $res = $this->send('POST', '/api/attest', $body + ['region_representation' => $rep]);
        $this->assertSame(422, $res->status);
        $this->assertSame(0, $this->app->attestations->count());
    }

    public function testAnAttestationWithoutARepresentationStillWorksAndHasNoRepresentationFile(): void
    {
        $b = $this->bundle();
        $res = $this->send('POST', '/api/attest', $this->client->body($b));
        $this->assertSame(201, $res->status);
        $this->assertNull($this->app->attestations->representationFor((int) $res->data()['attestation_id']));
        $files = $this->zipFiles($this->send('GET', '/api/pack/' . $res->data()['pack_id'] . '/download')->body);
        $this->assertArrayNotHasKey('representation.json', $files);
    }
}
