<?php

declare(strict_types=1);

namespace Mra\Service;

use Mra\Crypto\ClientKeyVerifier;
use Mra\Crypto\Jcs;
use Mra\Model\Session;
use Mra\Model\User;
use Mra\Repository\AttestationRepository;
use Mra\Repository\AttestorRegistry;
use Mra\Repository\BundleRepository;
use Mra\Repository\CommitmentRepository;
use Mra\Support\Clock;
use Mra\Validation\AttestationSchema;
use Mra\Validation\RegionPolicy;
use PDO;

/**
 * Full server-side validation of a client attestation.
 *
 * Order is cheapest first: schema, then signature, then the checks that touch the database. A
 * malformed payload never reaches a query, and every input is treated as hostile: a crafted request
 * fails exactly as a browser-sent invalid one does. The single-use nonce is consumed last, with one
 * atomic UPDATE, inside the same transaction as the write, so a rejected or failed attestation never
 * spends it and two simultaneous submissions cannot both win.
 */
final class AttestationValidator
{
    private const TARGETS = ['accept' => RegionPolicy::ACCEPT_ID, 'reject' => RegionPolicy::REJECT_ID];

    public function __construct(
        private readonly PDO $pdo,
        private readonly CommitmentRepository $commitments,
        private readonly BundleRepository $bundles,
        private readonly NonceService $nonces,
        private readonly AttestorRegistry $attestors,
        private readonly AttestationRepository $attestations,
        private readonly CommitmentService $commitmentService,
        private readonly SessionService $sessions,
        private readonly MerkleLog $log,
        private readonly Clock $clock
    ) {
    }

    /**
     * @param array<string,mixed> $body
     * @return array{id:int,attestation_hash:string,commitment_hash:string,log_leaf_index:int,commitment_leaf_index:?int}
     * @throws AttestationRejected
     */
    public function validate(array $body, Session $session, User $user): array
    {
        // 1. Schema: no database, no crypto.
        $errors = AttestationSchema::check($body);
        if ($errors !== []) {
            throw new AttestationRejected(AttestationRejected::SCHEMA_INVALID, 422, 'The attestation is malformed.', ['fields' => $errors]);
        }
        /** @var array<string,mixed> $a */
        $a = $body['attestation'];
        $canonical = Jcs::encode($a);

        // 2. Signature, by the key the attestation carries.
        if (!ClientKeyVerifier::verify($canonical, (string) $body['signature'], (string) $a['client_pubkey'])) {
            throw new AttestationRejected(AttestationRejected::CLIENT_SIGNATURE_INVALID, 401, 'The signature does not verify.');
        }
        $fingerprint = ClientKeyVerifier::fingerprint((string) $a['client_pubkey']);

        // 3. The commitment this attestation answers.
        $stored = $this->commitments->findByHash((string) $a['commitment_hash']);
        if ($stored === null || CommitmentService::hash($stored['commitment_blob']) !== $a['commitment_hash']) {
            throw new AttestationRejected(AttestationRejected::COMMITMENT_UNKNOWN, 422, 'No such commitment.');
        }
        $commitment = json_decode($stored['commitment_blob'], true, 512, JSON_THROW_ON_ERROR);
        if (!$this->commitmentService->verify(['commitment' => $commitment, 'signature' => $stored['signature']])) {
            throw new AttestationRejected(AttestationRejected::COMMITMENT_UNKNOWN, 422, 'The stored commitment failed verification.');
        }

        // 4. Whose commitment is it: the caller's own session only.
        if ($commitment['session_id'] !== substr($session->id, 0, 16) || $a['session_id'] !== $commitment['session_id']) {
            throw new AttestationRejected(AttestationRejected::SESSION_MISMATCH, 403, 'This commitment belongs to another session.');
        }
        $registered = $this->sessions->resolveById($session->id)?->clientPubkeyFpr;
        if ($fingerprint === null || $fingerprint !== $commitment['client_pubkey_fpr'] || $fingerprint !== $registered) {
            throw new AttestationRejected(AttestationRejected::KEY_BINDING_INVALID, 401, 'The key is not the one registered for this session.');
        }

        // 5. Nonce and attestor must be the ones the server committed to.
        if ($a['nonce'] !== $commitment['nonce']) {
            throw new AttestationRejected(AttestationRejected::NONCE_MISMATCH, 422, 'The nonce differs from the committed one.');
        }
        if ($a['attestor_hash'] !== $commitment['attestor_hash']) {
            throw new AttestationRejected(AttestationRejected::ATTESTOR_MISMATCH, 422, 'The attestor differs from the committed one.');
        }
        $nonce = $this->nonces->inspect((string) $a['nonce']);
        if ($nonce === null || $nonce['session_id'] !== $session->id) {
            throw new AttestationRejected(AttestationRejected::SESSION_MISMATCH, 403, 'This nonce belongs to another session.');
        }
        if ($nonce['consumed']) {
            throw new AttestationRejected(AttestationRejected::REPLAY_DETECTED, 409, 'This commitment has already been attested.');
        }
        if ($nonce['expired'] || $this->clock->now() > new \DateTimeImmutable((string) $commitment['expires_at'])) {
            throw new AttestationRejected(AttestationRejected::COMMITMENT_EXPIRED, 422, 'The commitment has expired.');
        }
        if (!$this->attestors->isRecognised((string) $a['attestor_hash'])) {
            throw new AttestationRejected(AttestationRejected::ATTESTOR_UNRECOGNISED, 422, 'The attestor build is not recognised.');
        }
        if ((self::TARGETS[$a['action']] ?? null) !== $a['action_target']) {
            throw new AttestationRejected(AttestationRejected::ACTION_TARGET_INVALID, 422, 'The action and its target do not agree.');
        }

        // 6. Region policy, on the bundle the server committed to (D-04).
        $this->assertRegionPolicy($commitment);

        // 7. Spend the nonce and write, atomically.
        $leafOfCommitment = isset($commitment['log_leaf_index']) ? (int) $commitment['log_leaf_index'] : null;
        return $this->persist($a, $canonical, (string) $body['signature'], $fingerprint, $user, $session->id, $leafOfCommitment);
    }

    /** @param array<string,mixed> $commitment */
    private function assertRegionPolicy(array $commitment): void
    {
        $canonicalBundle = $this->bundles->canonical((string) $commitment['bundle_id']);
        $data = $canonicalBundle === null ? null : json_decode($canonicalBundle, true);
        if (!is_array($data) || BundleBuilder::hashOf($canonicalBundle) !== $commitment['bundle_hash']) {
            throw new AttestationRejected(AttestationRejected::COMMITMENT_UNKNOWN, 422, 'The committed bundle is unavailable or altered.');
        }
        $violations = RegionPolicy::check(
            (string) $data['markup'],
            (string) $data['css'],
            (string) $data['critical_region'],
            (string) $data['region_policy']
        );
        if ($violations !== []) {
            throw new AttestationRejected(
                AttestationRejected::REGION_POLICY_VIOLATION,
                422,
                'The committed region does not satisfy the region policy.',
                ['violations' => $violations]
            );
        }
    }

    /**
     * @param array<string,mixed> $a
     * @return array{id:int,attestation_hash:string,commitment_hash:string,log_leaf_index:int,commitment_leaf_index:?int}
     */
    private function persist(
        array $a,
        string $canonical,
        string $signature,
        string $fingerprint,
        User $user,
        string $sessionId,
        ?int $commitmentLeaf
    ): array {
        $owns = !$this->pdo->inTransaction();
        if ($owns) {
            $this->pdo->beginTransaction();
        }
        try {
            if (!$this->nonces->consume((string) $a['nonce'], $sessionId)) {
                throw new AttestationRejected(AttestationRejected::REPLAY_DETECTED, 409, 'This commitment has already been attested.');
            }
            $hash = 'sha256:' . hash('sha256', $canonical);
            // Second leaf (decision D-07): written now, after the commitment leaf, and referencing it.
            $leaf = $this->log->append(static fn (int $index): array => [
                'v' => 'mra/1.0',
                'kind' => 'attestation',
                'ref_hash' => $hash,
                'attestation' => $a,
                'signature' => $signature,
                'commitment_leaf_index' => $commitmentLeaf,
            ]);
            $id = $this->attestations->save(
                $hash,
                (string) $a['commitment_hash'],
                $user->id,
                (string) $a['action'],
                $canonical,
                $signature,
                $fingerprint,
                $leaf['index'],
                $this->clock->now()
            );
            if ($owns) {
                $this->pdo->commit();
            }
            return [
                'id' => $id,
                'attestation_hash' => $hash,
                'commitment_hash' => (string) $a['commitment_hash'],
                'log_leaf_index' => $leaf['index'],
                'commitment_leaf_index' => $commitmentLeaf,
            ];
        } catch (\Throwable $e) {
            if ($owns && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }
}
