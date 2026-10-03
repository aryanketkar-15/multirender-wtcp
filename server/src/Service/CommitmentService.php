<?php

declare(strict_types=1);

namespace Mra\Service;

use InvalidArgumentException;
use Mra\Crypto\Jcs;
use Mra\Crypto\Signer;
use Mra\Model\Bundle;
use Mra\Repository\CommitmentRepository;
use Mra\Support\Clock;

/**
 * The server's half of the mutual evidence: a signed commitment issued before interaction is
 * possible. commitment_hash = SHA-256(JCS(commitment)); the signature is Ed25519 over the same
 * JCS text. The client later signs commitment_hash, not bundle_hash, so one honest bundle cannot be
 * replayed under a different nonce, policy or expiry.
 */
final class CommitmentService
{
    public const TYPE = 'server_commitment';
    public const HEADER = 'X-MRA-Commitment';

    public function __construct(
        private readonly Signer $signer,
        private readonly CommitmentRepository $repo,
        private readonly Clock $clock
    ) {
    }

    /**
     * @param array{
     *     session_id:string,
     *     nonce:string,
     *     attestor_version:string,
     *     client_pubkey_fpr:string,
     *     validity_minutes?:int,
     *     log_leaf_index?:int|null
     * } $ctx
     * @return array{commitment:array<string,mixed>,commitment_hash:string,signature:string,header:string}
     */
    public function issue(Bundle $bundle, array $ctx): array
    {
        $minutes = $ctx['validity_minutes'] ?? 15;
        if ($minutes < 1 || $minutes > 60) {
            throw new InvalidArgumentException('Validity window must be between 1 and 60 minutes.');
        }
        $now = $this->clock->now();
        $commitment = [
            'v' => BundleBuilder::VERSION,
            'type' => self::TYPE,
            'session_id' => $ctx['session_id'],
            'bundle_id' => $bundle->bundleId,
            'bundle_hash' => $bundle->hash,
            'attestor_hash' => $bundle->data['attestor_hash'],
            'attestor_version' => $ctx['attestor_version'],
            'region_policy' => $bundle->regionPolicy,
            'nonce' => $ctx['nonce'],
            'issued_at' => $now->format('Y-m-d\TH:i:s\Z'),
            'expires_at' => $now->modify("+{$minutes} minutes")->format('Y-m-d\TH:i:s\Z'),
            'client_pubkey_fpr' => $ctx['client_pubkey_fpr'],
            // Assigned once the Merkle log exists (Phase 3 of the build playbook).
            'log_leaf_index' => $ctx['log_leaf_index'] ?? null,
            'key_id' => $this->signer->keyId(),
        ];
        $canonical = Jcs::encode($commitment);
        $hash = self::hash($canonical);
        $signature = $this->signer->sign($canonical);
        $this->repo->save($commitment, $canonical, $hash, $signature);

        return [
            'commitment' => $commitment,
            'commitment_hash' => $hash,
            'signature' => $signature,
            'header' => self::encodeHeader($commitment, $hash, $signature),
        ];
    }

    /**
     * Full check an independent party performs: hash recomputes, key resolves by key_id, signature holds.
     *
     * @param array<string,mixed> $envelope commitment, commitment_hash, signature
     */
    public function verify(array $envelope): bool
    {
        $commitment = $envelope['commitment'] ?? null;
        $signature = $envelope['signature'] ?? null;
        if (!is_array($commitment) || !is_string($signature) || !is_string($commitment['key_id'] ?? null)) {
            return false;
        }
        $canonical = Jcs::encode($commitment);
        if (isset($envelope['commitment_hash']) && !hash_equals(self::hash($canonical), (string) $envelope['commitment_hash'])) {
            return false;
        }
        return ($commitment['type'] ?? null) === self::TYPE
            && $this->signer->verify($canonical, $signature, $commitment['key_id']);
    }

    public static function hash(string $canonical): string
    {
        return 'sha256:' . hash('sha256', $canonical);
    }

    /** @param array<string,mixed> $commitment */
    public static function encodeHeader(array $commitment, string $hash, string $signature): string
    {
        return Signer::b64(Jcs::encode([
            'commitment' => $commitment,
            'commitment_hash' => $hash,
            'signature' => $signature,
        ]));
    }

    /** @return array<string,mixed>|null */
    public static function decodeHeader(string $header): ?array
    {
        $raw = Signer::unb64($header);
        $decoded = $raw === null ? null : json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }
}
