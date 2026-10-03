<?php

declare(strict_types=1);

namespace Mra\Tests\Http;

use Mra\App;
use Mra\Config\Env;
use Mra\Crypto\Jcs;
use Mra\Crypto\Signer;
use Mra\Http\Kernel;
use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Service\MerkleProof;
use Mra\Service\SessionService;
use Mra\Tests\Support\ClientSimulator;
use Mra\Tests\TestCase;

/** The two-leaf design (D-07) exercised through the real endpoints. */
final class LogIntegrationTest extends TestCase
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
            'version' => '1.0.0',
            'file' => 'mra-attestor-1.0.0.js',
            'sha384' => 'sha384-' . str_repeat('A', 64),
            'sha256' => 'sha256:' . str_repeat('c', 64),
        ]);
        $this->client = ClientSimulator::create();
        $id = $this->app->users->create('log@example.com', 'Log', 'h');
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
            '198.51.100.90',
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

    /** @return array<string,mixed> */
    private function publicGet(string $path, array $query = []): Response
    {
        return $this->kernel->handle(new Request('GET', $path, [], [], [], '198.51.100.91', null, $query));
    }

    public function testTheCommitmentLeafExistsBeforeAnyAttestation(): void // T4.4.1
    {
        $before = $this->app->log->size();
        $b = $this->bundle();
        $this->assertSame($before + 1, $this->app->log->size());
        $this->assertSame(0, $this->app->attestations->count());

        $index = $b['commitment']['log_leaf_index'];
        $this->assertSame($before, $index, 'the commitment names the slot it was given');
        $leaf = $this->app->log->leaf($index);
        $this->assertSame('commitment', $leaf['kind']);
        $this->assertSame($b['commitment_hash'], $leaf['ref_hash']);
        $record = json_decode($leaf['record_json'], true);
        $this->assertEquals($b['commitment'], $record['commitment']);
        $this->assertSame($b['signature'], $record['signature']);
    }

    public function testTheCommitmentIsSignedWithItsOwnLeafIndexInside(): void
    {
        $b = $this->bundle();
        $this->assertTrue($this->app->commitments->verify([
            'commitment' => $b['commitment'],
            'commitment_hash' => $b['commitment_hash'],
            'signature' => $b['signature'],
        ]));
        $forged = $b['commitment'];
        $forged['log_leaf_index'] = $forged['log_leaf_index'] + 1;
        $this->assertFalse($this->app->commitments->verify(['commitment' => $forged, 'signature' => $b['signature']]));
    }

    public function testTheAttestationLeafComesLaterAndReferencesTheCommitmentLeaf(): void // T4.4.2
    {
        $b = $this->bundle();
        $res = $this->send('POST', '/api/attest', $this->client->body($b));
        $this->assertSame(201, $res->status);
        $commitmentIndex = $res->data()['commitment_leaf_index'];
        $attestationIndex = $res->data()['log_leaf_index'];
        $this->assertSame($b['commitment']['log_leaf_index'], $commitmentIndex);
        $this->assertGreaterThan($commitmentIndex, $attestationIndex, 'ordering is provable from the log itself');

        $leaf = $this->app->log->leaf($attestationIndex);
        $this->assertSame('attestation', $leaf['kind']);
        $this->assertSame($res->data()['attestation_hash'], $leaf['ref_hash']);
        $record = json_decode($leaf['record_json'], true);
        $this->assertSame($commitmentIndex, $record['commitment_leaf_index']);
        $row = $this->app->attestations->findByCommitment($b['commitment_hash']);
        $this->assertSame($attestationIndex, (int) $row['log_leaf_index']);
    }

    public function testAFailedAttestationAddsNothingToTheLog(): void
    {
        $b = $this->bundle();
        $size = $this->app->log->size();
        $bad = $this->client->body($b);
        $bad['attestation']['context_digest'] = 'sha256:' . str_repeat('0', 64);
        $this->assertSame(401, $this->send('POST', '/api/attest', $bad)->status);
        $this->assertSame($size, $this->app->log->size());
    }

    public function testBothLeavesProveAgainstASignedTreeHead(): void // T4.4.3
    {
        $b = $this->bundle();
        $att = $this->send('POST', '/api/attest', $this->client->body($b))->data();
        $head = $this->app->sth->sign();
        $this->assertTrue($this->app->sth->verify($head['record'], $head['signature']));

        foreach ([$att['commitment_leaf_index'], $att['log_leaf_index']] as $index) {
            $proof = $this->app->log->inclusionProof($index, (int) $head['record']['tree_size']);
            $this->assertTrue(MerkleProof::verifyAgainstHead($proof, $head['record']), "leaf {$index}");
        }
    }

    public function testTamperingWithTheCommitmentLeafInSqlBreaksItsProofAgainstTheSignedHead(): void // T4.4.4
    {
        $b = $this->bundle();
        $this->send('POST', '/api/attest', $this->client->body($b));
        $head = $this->app->sth->sign();
        $index = $b['commitment']['log_leaf_index'];
        $this->assertTrue(MerkleProof::verifyAgainstHead($this->app->log->inclusionProof($index, (int) $head['record']['tree_size']), $head['record']));

        $record = json_decode($this->app->log->leaf($index)['record_json'], true);
        $record['commitment']['expires_at'] = '2099-01-01T00:00:00Z';
        $this->pdo->prepare('UPDATE mra_leaf SET record_json = ? WHERE idx = ?')->execute([Jcs::encode($record), $index]);

        $proof = $this->app->log->inclusionProof($index, (int) $head['record']['tree_size']);
        $this->assertFalse(MerkleProof::verifyAgainstHead($proof, $head['record']));
    }

    public function testASignedHeadCannotBeAlteredWithoutBreakingItsSignature(): void
    {
        $this->bundle();
        $head = $this->app->sth->sign();
        $forged = $head['record'];
        $forged['root_hash'] = 'sha256:' . str_repeat('0', 64);
        $this->assertFalse($this->app->sth->verify($forged, $head['signature']));
        $forged = $head['record'];
        $forged['tree_size'] = $forged['tree_size'] + 1;
        $this->assertFalse($this->app->sth->verify($forged, $head['signature']));
    }

    public function testSigningTheSameTreeSizeTwiceReturnsTheSameHead(): void
    {
        $this->bundle();
        $a = $this->app->sth->sign();
        $this->clock->advance('+5 minutes');
        $b = $this->app->sth->sign();
        $this->assertSame($a['id'], $b['id']);
        $this->assertSame($a['signature'], $b['signature']);
        $this->bundle();
        $this->assertNotSame($a['id'], $this->app->sth->sign()['id']);
    }

    public function testPublicEndpointsLetAnOutsiderVerifyEverything(): void
    {
        $this->assertSame(404, $this->publicGet('/api/log/head')->status);
        $b = $this->bundle();
        $att = $this->send('POST', '/api/attest', $this->client->body($b))->data();
        $this->app->sth->sign();

        $headRes = $this->publicGet('/api/log/head')->data();
        $publicKey = $this->publicGet('/.well-known/mra-key')->data()['keys'][0]['public_key'];
        $this->assertTrue(Signer::verifyWithPublicKey(Jcs::encode($headRes['record']), $headRes['signature'], $publicKey));

        $res = $this->publicGet('/api/log/proof/' . $att['log_leaf_index'])->data();
        $this->assertSame('attestation', $res['leaf']['kind']);
        $this->assertTrue(MerkleProof::verifyAgainstHead($res['proof'], $res['tree_head']['record']));
        // The attestation's own signature is checkable from the log entry alone.
        $this->assertSame($att['attestation_hash'], 'sha256:' . hash('sha256', Jcs::encode($res['leaf']['record']['attestation'])));
    }

    public function testProofsBeyondTheLatestHeadAreNotYetAvailable(): void
    {
        $this->bundle();
        $this->app->sth->sign();
        $this->bundle(); // a newer leaf, not yet covered by any signed head
        $this->assertSame(409, $this->publicGet('/api/log/proof/1')->status);
        $this->assertSame(404, $this->publicGet('/api/log/proof/abc')->status);
    }

    public function testConsistencyEndpointProvesAppendOnlyGrowth(): void
    {
        $this->bundle();
        $first = $this->app->log->size();
        $this->bundle();
        $res = $this->publicGet('/api/log/consistency', ['first' => (string) $first, 'second' => (string) $this->app->log->size()])->data();
        $this->assertTrue(MerkleProof::verifyConsistency(
            $res['first'],
            $res['second'],
            substr($res['first_root'], 7),
            substr($res['second_root'], 7),
            $res['proof']
        ));
        $this->assertSame(422, $this->publicGet('/api/log/consistency', ['first' => '5', 'second' => '2'])->status);
        $this->assertSame(422, $this->publicGet('/api/log/consistency')->status);
    }

    public function testTheLogHoldsNoPersonalData(): void
    {
        $b = $this->bundle();
        $this->send('POST', '/api/attest', $this->client->body($b));
        $dump = '';
        foreach ($this->pdo->query('SELECT record_json FROM mra_leaf')->fetchAll(\PDO::FETCH_COLUMN) as $record) {
            $dump .= $record;
        }
        $this->assertStringNotContainsString('log@example.com', $dump);
        $this->assertStringNotContainsString('"name"', $dump);
    }
}
