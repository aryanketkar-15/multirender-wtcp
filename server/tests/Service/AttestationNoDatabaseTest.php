<?php

declare(strict_types=1);

namespace Mra\Tests\Service;

use DateTimeImmutable;
use Mra\Crypto\KeyStore;
use Mra\Crypto\Signer;
use Mra\Model\Session;
use Mra\Model\User;
use Mra\Repository\AttestationRepository;
use Mra\Repository\AttestorRegistry;
use Mra\Repository\BundleRepository;
use Mra\Repository\CommitmentRepository;
use Mra\Repository\SessionRepository;
use Mra\Service\AttestationRejected;
use Mra\Service\AttestationValidator;
use Mra\Service\CommitmentService;
use Mra\Service\NonceService;
use Mra\Service\SessionService;
use Mra\Tests\Support\BrokenPdo;
use Mra\Tests\Support\ClientSimulator;
use Mra\Tests\Support\FakeClock;
use PDOException;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * "A malformed payload should never reach a database query." Proven by giving the validator a
 * database that throws on any use: schema and signature failures must still come back as clean
 * rejections, and a well-formed, correctly signed attestation must reach the database (which
 * shows the test can tell the difference).
 */
final class AttestationNoDatabaseTest extends TestCase
{
    private AttestationValidator $validator;
    private Session $session;
    private User $user;

    protected function setUp(): void
    {
        $pdo = (new ReflectionClass(BrokenPdo::class))->newInstanceWithoutConstructor();
        $clock = new FakeClock();
        $commitments = new CommitmentRepository($pdo);
        $this->validator = new AttestationValidator(
            $pdo,
            $commitments,
            new BundleRepository($pdo),
            new NonceService($pdo, $clock),
            new AttestorRegistry($pdo),
            new AttestationRepository($pdo),
            new CommitmentService(new Signer(new KeyStore('k', str_repeat("\x03", 32))), $commitments, $clock),
            new SessionService(new SessionRepository($pdo), $clock),
            $clock
        );
        $now = new DateTimeImmutable();
        $this->session = new Session(str_repeat('a', 64), 1, str_repeat('b', 64), $now, $now);
        $this->user = new User(1, 'u@example.com', 'U', 'h', '2026-01-01 00:00:00', '2026-01-01 00:00:00');
    }

    /** @return array<string,mixed> */
    private function bundleResponse(): array
    {
        return [
            'commitment' => ['session_id' => str_repeat('a', 16), 'nonce' => str_repeat('b', 64), 'attestor_hash' => 'sha256:' . str_repeat('c', 64)],
            'commitment_hash' => 'sha256:' . str_repeat('d', 64),
        ];
    }

    public function testSchemaFailuresNeverTouchTheDatabase(): void
    {
        $body = ClientSimulator::create()->body($this->bundleResponse());
        unset($body['attestation']['nonce']);
        try {
            $this->validator->validate($body, $this->session, $this->user);
            $this->fail('expected rejection');
        } catch (AttestationRejected $e) {
            $this->assertSame('SCHEMA_INVALID', $e->errorCode);
        }
        $this->expectException(AttestationRejected::class);
        $this->validator->validate(['nonsense' => true], $this->session, $this->user);
    }

    public function testSignatureFailuresNeverTouchTheDatabase(): void
    {
        $client = ClientSimulator::create();
        $body = $client->body($this->bundleResponse());
        $body['attestation']['context_digest'] = 'sha256:' . str_repeat('0', 64);
        try {
            $this->validator->validate($body, $this->session, $this->user);
            $this->fail('expected rejection');
        } catch (AttestationRejected $e) {
            $this->assertSame('CLIENT_SIGNATURE_INVALID', $e->errorCode);
        }
    }

    public function testAWellFormedCorrectlySignedAttestationDoesReachTheDatabase(): void
    {
        $body = ClientSimulator::create()->body($this->bundleResponse());
        $this->expectException(PDOException::class);
        $this->validator->validate($body, $this->session, $this->user);
    }
}
