<?php

declare(strict_types=1);

namespace Mra\Tests\Http;

use Mra\App;
use Mra\Config\Env;
use Mra\Http\Kernel;
use Mra\Http\Response;
use Mra\Service\SessionService;
use Mra\Tests\Support\ClientSimulator;
use Mra\Tests\TestCase;

final class AttestationTest extends TestCase
{
    private App $app;
    private Kernel $kernel;
    private ClientSimulator $client;
    private int $userId;
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
        $this->userId = $this->app->users->create('att@example.com', 'Att', 'h');
        $this->app->users->markVerified($this->userId);
        $this->s = $this->session($this->userId);
    }

    /** @return array{token:string,csrf:string} */
    private function session(int $userId): array
    {
        $made = $this->app->sessions->create($userId);
        return ['token' => $made['token'], 'csrf' => $made['session']->csrfToken];
    }

    /** @param array{token:string,csrf:string}|null $s */
    private function send(string $method, string $path, array $body = [], ?array $s = null, bool $csrf = true): Response
    {
        $s ??= $this->s;
        return $this->call(
            $this->kernel,
            $method,
            $path,
            $body,
            '198.51.100.80',
            $csrf ? ['x-csrf-token' => $s['csrf']] : [],
            [SessionService::COOKIE => $s['token']]
        );
    }

    /**
     * Registers the simulated browser key and fetches a bundle: the server's commitment.
     *
     * @param array{token:string,csrf:string}|null $s
     * @return array<string,mixed>
     */
    private function bundle(?array $s = null, ?ClientSimulator $client = null): array
    {
        $client ??= $this->client;
        $this->assertSame(200, $this->send('POST', '/api/client-key', ['fingerprint' => $client->fingerprint], $s)->status);
        $res = $this->send('GET', '/api/bundle', [], $s);
        $this->assertSame(200, $res->status);
        return $res->data();
    }

    /** @param array<string,mixed> $body */
    private function attest(array $body, ?array $s = null): Response
    {
        return $this->send('POST', '/api/attest', $body, $s);
    }

    private function logged(string $code): int
    {
        $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM security_log WHERE detail LIKE ? AND event_type LIKE 'attestation.%'");
        $stmt->execute(['%"code":"' . $code . '"%']);
        return (int) $stmt->fetchColumn();
    }

    private function stored(): int
    {
        return $this->app->attestations->count();
    }

    public function testValidAcceptIsStored(): void // T4.3.1 / T4.2.1 (server half)
    {
        $b = $this->bundle();
        $res = $this->attest($this->client->body($b));
        $this->assertSame(201, $res->status);
        $this->assertMatchesRegularExpression('/^sha256:[a-f0-9]{64}$/', $res->data()['attestation_hash']);
        $this->assertSame($b['commitment_hash'], $res->data()['commitment_hash']);
        $this->assertSame(1, $this->stored());
        $row = $this->app->attestations->findByCommitment($b['commitment_hash']);
        $this->assertSame('accept', $row['action']);
        $this->assertSame($this->client->fingerprint, $row['client_pubkey_fpr']);
    }

    public function testValidRejectIsStoredToo(): void // T4.2.2 (server half)
    {
        $b = $this->bundle();
        $this->assertSame(201, $this->attest($this->client->body($b, 'reject'))->status);
        $this->assertSame('reject', $this->app->attestations->findByCommitment($b['commitment_hash'])['action']);
    }

    public function testStoredBlobHashesToTheReturnedHashAndCarriesTheCommitmentHash(): void // T4.2.3 (server half)
    {
        $b = $this->bundle();
        $res = $this->attest($this->client->body($b));
        $row = $this->app->attestations->findByCommitment($b['commitment_hash']);
        $this->assertSame($res->data()['attestation_hash'], 'sha256:' . hash('sha256', $row['attestation_blob']));
        $blob = json_decode($row['attestation_blob'], true);
        $this->assertSame($b['commitment_hash'], $blob['commitment_hash']);
        $this->assertArrayNotHasKey('bundle_hash', $blob, 'bound to the commitment, not to the bare bundle hash');
    }

    public function testMalformedSchemaIsRejectedWithoutAWrite(): void // T4.3.2
    {
        $b = $this->bundle();
        $body = $this->client->body($b);
        unset($body['attestation']['context_digest']);
        $res = $this->attest($body);
        $this->assertSame(422, $res->status);
        $this->assertSame('SCHEMA_INVALID', $res->data()['error']);
        $this->assertArrayHasKey('attestation.context_digest', $res->data()['detail']['fields']);
        $this->assertSame(0, $this->stored());
        $this->assertSame(1, $this->logged('SCHEMA_INVALID'));
    }

    /** @return array<string,array{callable(array<string,mixed>):array<string,mixed>}> */
    public static function malformed(): array
    {
        return [
            'unknown top-level member' => [static fn (array $b): array => $b + ['extra' => 1]],
            'unknown attestation member' => [static function (array $b): array {
                $b['attestation']['extra'] = 'x';
                return $b;
            }],
            'bad version' => [static function (array $b): array {
                $b['attestation']['v'] = 'mra/9';
                return $b;
            }],
            'bad action' => [static function (array $b): array {
                $b['attestation']['action'] = 'maybe';
                return $b;
            }],
            'digest wrong shape' => [static function (array $b): array {
                $b['attestation']['critical_region_digest'] = 'md5:abc';
                return $b;
            }],
            'nonce wrong length' => [static function (array $b): array {
                $b['attestation']['nonce'] = 'abc';
                return $b;
            }],
            'env not an object' => [static function (array $b): array {
                $b['attestation']['env'] = 'Blink';
                return $b;
            }],
            'env flag not boolean' => [static function (array $b): array {
                $b['attestation']['env']['forced_colors'] = 'no';
                return $b;
            }],
            'bad timestamp' => [static function (array $b): array {
                $b['attestation']['client_ts'] = '2026-13-45T99:00:00Z';
                return $b;
            }],
            'pubkey not PEM' => [static function (array $b): array {
                $b['attestation']['client_pubkey'] = 'not a key';
                return $b;
            }],
            'signature wrong length' => [static function (array $b): array {
                $b['signature'] = 'AAAA';
                return $b;
            }],
            'attestation is a list' => [static function (array $b): array {
                $b['attestation'] = [1, 2, 3];
                return $b;
            }],
            'attestation missing' => [static function (array $b): array {
                unset($b['attestation']);
                return $b;
            }],
        ];
    }

    /**
     * @param callable(array<string,mixed>):array<string,mixed> $mutate
     * @dataProvider malformed
     */
    public function testEveryKindOfMalformedInputFailsIdenticallyAndWritesNothing(callable $mutate): void
    {
        $body = $mutate($this->client->body($this->bundle()));
        $res = $this->attest($body);
        $this->assertSame(422, $res->status);
        $this->assertSame('SCHEMA_INVALID', $res->data()['error']);
        $this->assertSame(0, $this->stored());
    }

    public function testAlteredDigestAfterSigningFailsTheSignature(): void // T4.3.3
    {
        $b = $this->bundle();
        $body = $this->client->body($b);
        $body['attestation']['critical_region_digest'] = 'sha256:' . str_repeat('0', 64);
        $res = $this->attest($body);
        $this->assertSame(401, $res->status);
        $this->assertSame('CLIENT_SIGNATURE_INVALID', $res->data()['error']);
        $this->assertSame(1, $this->logged('CLIENT_SIGNATURE_INVALID'));
        $this->assertSame(0, $this->stored());
    }

    public function testEveryFieldIsCoveredByTheSignature(): void
    {
        $b = $this->bundle();
        $good = $this->client->body($b);
        $changes = [
            'session_id' => str_repeat('1', 16),
            'commitment_hash' => 'sha256:' . str_repeat('1', 64),
            'context_digest' => 'sha256:' . str_repeat('1', 64),
            'action' => 'reject',
            'action_target' => 'btn-reject',
            'attestor_hash' => 'sha256:' . str_repeat('1', 64),
            'nonce' => str_repeat('1', 64),
            'client_ts' => '2030-01-01T00:00:00Z',
        ];
        foreach ($changes as $field => $value) {
            $body = $good;
            $body['attestation'][$field] = $value;
            $res = $this->attest($body);
            $this->assertSame('CLIENT_SIGNATURE_INVALID', $res->data()['error'] ?? '', $field);
        }
        $body = $good;
        $body['attestation']['env']['engine'] = 'Gecko';
        $this->assertSame('CLIENT_SIGNATURE_INVALID', $this->attest($body)->data()['error']);
    }

    public function testAttestationSignedByAnUnregisteredKeyIsRefused(): void // T4.3.4
    {
        $b = $this->bundle();
        $impostor = ClientSimulator::create();
        $res = $this->attest($impostor->body($b));
        $this->assertSame(401, $res->status);
        $this->assertSame('KEY_BINDING_INVALID', $res->data()['error']);
        $this->assertSame(1, $this->logged('KEY_BINDING_INVALID'));
        $this->assertSame(0, $this->stored());
    }

    public function testRejectedAttemptsDoNotSpendTheNonce(): void
    {
        $b = $this->bundle();
        $this->attest(ClientSimulator::create()->body($b));
        $bad = $this->client->body($b);
        $bad['attestation']['context_digest'] = 'sha256:' . str_repeat('0', 64);
        $this->attest($bad);
        $this->assertSame(201, $this->attest($this->client->body($b))->status, 'the honest attempt still works');
    }

    public function testSpentNonceIsAReplay(): void // T4.3.5
    {
        $b = $this->bundle();
        $this->assertSame(201, $this->attest($this->client->body($b))->status);
        $again = $this->attest($this->client->body($b));
        $this->assertSame(409, $again->status);
        $this->assertSame('REPLAY_DETECTED', $again->data()['error']);
        $this->assertSame(1, (int) $this->pdo->query("SELECT COUNT(*) FROM security_log WHERE event_type = 'attestation.replay_detected'")->fetchColumn());
        $this->assertSame(1, $this->stored());
    }

    public function testAReplayWithDifferentContentIsStillAReplay(): void
    {
        $b = $this->bundle();
        $this->attest($this->client->body($b, 'accept'));
        $second = $this->attest($this->client->body($b, 'reject'));
        $this->assertSame(409, $second->status, 'one commitment can be answered once, whatever the answer');
        $this->assertSame('accept', $this->app->attestations->findByCommitment($b['commitment_hash'])['action']);
    }

    public function testExpiredCommitmentIsRefused(): void // T4.3.6
    {
        $b = $this->bundle();
        $body = $this->client->body($b);
        $this->clock->advance('+16 minutes');
        $res = $this->attest($body);
        $this->assertSame(422, $res->status);
        $this->assertSame('COMMITMENT_EXPIRED', $res->data()['error']);
        $this->assertSame(0, $this->stored());
    }

    public function testStillValidJustInsideTheWindow(): void
    {
        $b = $this->bundle();
        $body = $this->client->body($b);
        $this->clock->advance('+14 minutes 59 seconds');
        $this->assertSame(201, $this->attest($body)->status);
    }

    public function testCommittedRegionMissingARejectControlViolatesPolicy(): void // T4.3.7
    {
        $b = $this->customBundle('<section id="consent-region"><p>We share your data.</p>'
            . '<button id="btn-agree" type="button">Accept</button></section>');
        $res = $this->attest($this->client->body($b));
        $this->assertSame(422, $res->status);
        $this->assertSame('REGION_POLICY_VIOLATION', $res->data()['error']);
        $this->assertContains('no reject control', $res->data()['detail']['violations']);
        $this->assertSame(0, $this->stored());
        $this->assertSame(1, $this->logged('REGION_POLICY_VIOLATION'));
    }

    public function testAHiddenRejectControlViolatesPolicyToo(): void
    {
        $b = $this->customBundle(
            '<section id="consent-region"><p>We share your data.</p><button id="btn-agree" type="button">Accept</button>'
            . '<button id="btn-reject" type="button" style="display:none">Reject</button></section>'
        );
        $this->assertSame('REGION_POLICY_VIOLATION', $this->attest($this->client->body($b))->data()['error']);
    }

    /**
     * A commitment for a bundle the server chose, as a dishonest server would issue one.
     *
     * @return array<string,mixed>
     */
    private function customBundle(string $markup, string $css = 'p{margin:0}'): array
    {
        $this->assertSame(200, $this->send('POST', '/api/client-key', ['fingerprint' => $this->client->fingerprint])->status);
        $active = $this->app->attestors->active();
        $bundle = (new \Mra\Service\BundleBuilder())->build([
            'bundle_id' => 'bnd_custom_' . bin2hex(random_bytes(4)),
            'markup' => $markup,
            'css' => $css,
            'critical_region' => '#consent-region',
            'region_policy' => 'consent/v1',
            'attestor_hash' => $active['hash'],
        ]);
        $this->app->bundles->save($bundle);
        $session = $this->app->sessions->resolve($this->s['token']);
        $nonce = $this->app->nonces->issue($session->id, $this->userId, $this->client->fingerprint, $bundle->bundleId);
        $issued = $this->app->commitments->issue($bundle, [
            'session_id' => substr($session->id, 0, 16),
            'nonce' => $nonce,
            'attestor_version' => '1.0.0',
            'client_pubkey_fpr' => $this->client->fingerprint,
        ]);
        return [
            'bundle' => $bundle->data,
            'bundle_hash' => $bundle->hash,
            'commitment' => $issued['commitment'],
            'commitment_hash' => $issued['commitment_hash'],
            'nonce' => $nonce,
        ];
    }

    public function testCommitmentHidingTheRejectControlWithCssIsRefused(): void
    {
        $b = $this->customBundle(
            '<section id="consent-region"><p>We share your data.</p><button id="btn-agree" type="button">Accept</button>'
            . '<button id="btn-reject" type="button">Reject</button></section>',
            '#btn-reject{display:none}'
        );
        $this->assertSame('REGION_POLICY_VIOLATION', $this->attest($this->client->body($b))->data()['error']);
    }

    public function testUnrecognisedAttestorIsRefused(): void // T4.3.8
    {
        $b = $this->bundle();
        $this->app->attestors->setStatus('sha256:' . str_repeat('c', 64), 'revoked');
        $res = $this->attest($this->client->body($b));
        $this->assertSame(422, $res->status);
        $this->assertSame('ATTESTOR_UNRECOGNISED', $res->data()['error']);
        $this->assertSame(1, $this->logged('ATTESTOR_UNRECOGNISED'));
    }

    public function testAttestorDifferingFromTheCommittedOneIsRefused(): void
    {
        $b = $this->bundle();
        $body = $this->client->body($b, 'accept', ['attestor_hash' => 'sha256:' . str_repeat('9', 64)]);
        $this->assertSame('ATTESTOR_MISMATCH', $this->attest($body)->data()['error']);
    }

    public function testNonceDifferingFromTheCommittedOneIsRefused(): void
    {
        $b = $this->bundle();
        $body = $this->client->body($b, 'accept', ['nonce' => str_repeat('7', 64)]);
        $this->assertSame('NONCE_MISMATCH', $this->attest($body)->data()['error']);
    }

    public function testAnotherSessionsCommitmentIsForbidden(): void // T4.3.9
    {
        $b = $this->bundle();
        $otherUser = $this->app->users->create('other@example.com', 'Other', 'h');
        $this->app->users->markVerified($otherUser);
        $other = $this->session($otherUser);
        $this->assertSame(200, $this->send('POST', '/api/client-key', ['fingerprint' => $this->client->fingerprint], $other)->status);
        $res = $this->attest($this->client->body($b), $other);
        $this->assertSame(403, $res->status);
        $this->assertSame('SESSION_MISMATCH', $res->data()['error']);
        $this->assertSame(1, $this->logged('SESSION_MISMATCH'));
        $this->assertSame(0, $this->stored());
    }

    public function testUnknownCommitmentIsRefused(): void
    {
        $b = $this->bundle();
        $body = $this->client->body($b, 'accept', ['commitment_hash' => 'sha256:' . str_repeat('4', 64)]);
        $this->assertSame('COMMITMENT_UNKNOWN', $this->attest($body)->data()['error']);
    }

    public function testActionMustMatchItsTarget(): void
    {
        $b = $this->bundle();
        $body = $this->client->body($b, 'accept', ['action_target' => 'btn-reject']);
        $this->assertSame('ACTION_TARGET_INVALID', $this->attest($body)->data()['error']);
    }

    public function testEndpointGuards(): void
    {
        $b = $this->bundle();
        $body = $this->client->body($b);
        $this->assertSame(403, $this->send('POST', '/api/attest', $body, null, false)->status, 'CSRF is required');
        $this->assertSame(403, $this->call($this->kernel, 'POST', '/api/attest', $body)->status, 'no session, no CSRF');
        $unverified = $this->app->users->create('new@example.com', 'New', 'h');
        $res = $this->send('POST', '/api/attest', $body, $this->session($unverified));
        $this->assertSame(403, $res->status);
        $this->assertSame('email_not_verified', $res->data()['error']);
        $this->assertSame(0, $this->stored());
    }

    public function testSecretsNeverReachTheSecurityLog(): void
    {
        $b = $this->bundle();
        $body = $this->client->body($b);
        $body['attestation']['critical_region_digest'] = 'sha256:' . str_repeat('0', 64);
        $this->attest($body);
        $dump = json_encode($this->pdo->query('SELECT * FROM security_log')->fetchAll(), JSON_INVALID_UTF8_SUBSTITUTE);
        $this->assertStringNotContainsString('BEGIN PUBLIC KEY', (string) $dump);
        $this->assertStringNotContainsString($body['signature'], (string) $dump);
    }

    public function testPhase1StaysIntact(): void // T4.3.11 (the full suite is run separately; this guards the shared path)
    {
        $res = $this->call($this->kernel, 'GET', '/api/session');
        $this->assertSame(200, $res->status);
        $this->assertSame(404, $this->call($this->kernel, 'POST', '/api/attestation', [])->status, 'the old stub route is gone');
    }
}
