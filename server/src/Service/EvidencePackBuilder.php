<?php

declare(strict_types=1);

namespace Mra\Service;

use InvalidArgumentException;
use Mra\Crypto\Jcs;
use Mra\Repository\AttestationRepository;
use Mra\Repository\BundleRepository;
use Mra\Repository\CommitmentRepository;
use Mra\Repository\PackRepository;
use PDO;
use RuntimeException;
use ZipArchive;

/**
 * Assembles self-contained, offline-verifiable evidence packs.
 *
 * An evidence pack bundles:
 * 1. The sealed render bundle (RFC 8785 canonical JSON).
 * 2. The server's Ed25519 commitment and signature.
 * 3. The client's ECDSA P-256 attestation and signature.
 * 4. The client's public key (PEM).
 * 5. RFC 6962 inclusion proofs for both log leaves (commitment and attestation).
 * 6. The signed tree head (STH) covering both leaves.
 * 7. A versioned manifest.json indexing every component.
 *
 * Verifiable offline with zero network access and no contact with the issuing server.
 */
final class EvidencePackBuilder
{
    public const SCHEMA_VERSION = '1.0';

    public function __construct(
        private readonly PDO $pdo,
        private readonly BundleRepository $bundles,
        private readonly CommitmentRepository $commitments,
        private readonly AttestationRepository $attestations,
        private readonly PackRepository $packs,
        private readonly MerkleLog $log,
        private readonly SthService $sth
    ) {
    }

    /**
     * Builds a ZIP archive for the given pack id.
     * Returns raw binary ZIP content.
     */
    public function build(string $packId): string
    {
        $pack = $this->packs->find($packId);
        if ($pack === null) {
            throw new InvalidArgumentException("Evidence pack {$packId} not found.");
        }

        if ($pack['attestation_id'] === null) {
            return $this->buildStubZip($packId, (string) $pack['created_at']);
        }

        return $this->buildFullZip($packId, (int) $pack['attestation_id'], (string) $pack['created_at']);
    }

    private function buildStubZip(string $packId, string $createdAt): string
    {
        $manifest = [
            'schema_version' => self::SCHEMA_VERSION,
            'pack_id' => $packId,
            'status' => 'stub',
            'created_at' => $createdAt,
            'components' => [],
        ];
        return $this->createZip([
            'manifest.json' => json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        ]);
    }

    private function buildFullZip(string $packId, int $attestationId, string $createdAt): string
    {
        $stmt = $this->pdo->prepare('SELECT * FROM mra_attestation WHERE id = ?');
        $stmt->execute([$attestationId]);
        $attestationRow = $stmt->fetch();
        if ($attestationRow === false) {
            throw new RuntimeException("Attestation record {$attestationId} missing.");
        }

        $commitmentHash = (string) $attestationRow['commitment_hash'];
        $stmt = $this->pdo->prepare('SELECT * FROM mra_commitment WHERE commitment_hash = ?');
        $stmt->execute([$commitmentHash]);
        $commitmentRow = $stmt->fetch();
        if ($commitmentRow === false) {
            throw new RuntimeException("Commitment record {$commitmentHash} missing.");
        }

        $bundleId = (string) $commitmentRow['bundle_id'];
        $stmt = $this->pdo->prepare('SELECT * FROM mra_bundle WHERE bundle_id = ?');
        $stmt->execute([$bundleId]);
        $bundleRow = $stmt->fetch();
        if ($bundleRow === false) {
            throw new RuntimeException("Bundle record {$bundleId} missing.");
        }

        $attestationLeafIndex = (int) $attestationRow['log_leaf_index'];
        $commitmentLeafIndex = (int) $commitmentRow['log_leaf_index'];

        // Ensure tree head covers both leaves.
        $head = $this->sth->latest();
        if ($head === null || (int) $head['record']['tree_size'] <= $attestationLeafIndex) {
            $head = $this->sth->sign();
        }
        $treeSize = (int) $head['record']['tree_size'];

        $commitmentProof = $this->log->inclusionProof($commitmentLeafIndex, $treeSize);
        $attestationProof = $this->log->inclusionProof($attestationLeafIndex, $treeSize);

        $commitmentLeaf = $this->log->leaf($commitmentLeafIndex);
        $attestationLeaf = $this->log->leaf($attestationLeafIndex);

        if ($commitmentLeaf !== null) {
            $commitmentProof['leaf_record'] = json_decode($commitmentLeaf['record_json'], true);
        }
        if ($attestationLeaf !== null) {
            $attestationProof['leaf_record'] = json_decode($attestationLeaf['record_json'], true);
        }

        $attestationRecord = json_decode((string) $attestationRow['attestation_blob'], true);
        $commitmentRecord = json_decode((string) $commitmentRow['commitment_blob'], true);
        $bundleRecord = json_decode((string) $bundleRow['canonical_blob'], true);
        $clientPubkey = (string) ($attestationRecord['client_pubkey'] ?? '');

        $commitmentJson = [
            'record' => $commitmentRecord,
            'signature' => (string) $commitmentRow['signature'],
            'commitment_hash' => $commitmentHash,
            'key_id' => (string) $commitmentRow['key_id'],
        ];

        $attestationJson = [
            'record' => $attestationRecord,
            'signature' => (string) $attestationRow['signature'],
            'attestation_hash' => (string) $attestationRow['attestation_hash'],
        ];

        $manifest = [
            'schema_version' => self::SCHEMA_VERSION,
            'pack_id' => $packId,
            'created_at' => $createdAt,
            'server_key_id' => (string) $commitmentRow['key_id'],
            'client_pubkey_fpr' => (string) $attestationRow['client_pubkey_fpr'],
            'hashes' => [
                'bundle_hash' => (string) $bundleRow['bundle_hash'],
                'commitment_hash' => $commitmentHash,
                'attestation_hash' => (string) $attestationRow['attestation_hash'],
                'client_pubkey_fpr' => (string) $attestationRow['client_pubkey_fpr'],
            ],
            'tree' => [
                'tree_size' => $treeSize,
                'root_hash' => (string) $head['record']['root_hash'],
                'commitment_leaf_index' => $commitmentLeafIndex,
                'attestation_leaf_index' => $attestationLeafIndex,
            ],
            'components' => [
                'bundle' => 'bundle.json',
                'commitment' => 'commitment.json',
                'attestation' => 'attestation.json',
                'client_pubkey' => 'client_pubkey.pem',
                'inclusion_proof_commitment' => 'inclusion_proof_commitment.json',
                'inclusion_proof_attestation' => 'inclusion_proof_attestation.json',
                'signed_tree_head' => 'signed_tree_head.json',
            ],
        ];

        return $this->createZip([
            'manifest.json' => json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            'bundle.json' => json_encode($bundleRecord, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            'commitment.json' => json_encode($commitmentJson, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            'attestation.json' => json_encode($attestationJson, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            'client_pubkey.pem' => $clientPubkey,
            'inclusion_proof_commitment.json' => json_encode($commitmentProof, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            'inclusion_proof_attestation.json' => json_encode($attestationProof, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            'signed_tree_head.json' => json_encode($head, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        ]);
    }

    /**
     * @param array<string,string> $files filename => content
     */
    private function createZip(array $files): string
    {
        $tempFile = tempnam(sys_get_temp_dir(), 'mra_pack_');
        if ($tempFile === false) {
            throw new RuntimeException('Could not create temporary file for evidence pack.');
        }

        $zip = new ZipArchive();
        if ($zip->open($tempFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Could not initialise ZIP archive.');
        }

        foreach ($files as $name => $content) {
            $zip->addFromString($name, $content);
        }
        $zip->close();

        $binary = file_get_contents($tempFile);
        @unlink($tempFile);

        if ($binary === false) {
            throw new RuntimeException('Failed to read generated ZIP archive.');
        }

        return $binary;
    }
}
