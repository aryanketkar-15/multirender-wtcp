import AdmZip from 'adm-zip';
import type { PackManifest, UnpackedPack } from '../verdicts';
import { sha256Hex } from './crypto';

export const REQUIRED_FILES = [
  'manifest.json',
  'bundle.json',
  'commitment.json',
  'attestation.json',
  'client_pubkey.pem',
  'inclusion_proof_commitment.json',
  'inclusion_proof_attestation.json',
  'signed_tree_head.json',
] as const;

export class PackMalformedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackMalformedError';
  }
}

/**
 * Unpacks an evidence pack archive and validates Stage 1:
 * - Valid ZIP format
 * - All 8 required files present in root
 * - manifest.json carries schema_version: "1.0"
 * - All JSON files parse correctly
 * - Manifest integrity hashes match (if manifest.files is specified)
 */
export function unpackPack(zipBuffer: Buffer): UnpackedPack {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch (err) {
    throw new PackMalformedError(`Failed to parse ZIP archive: ${(err as Error).message}`);
  }

  const entries = zip.getEntries();
  const fileBuffers: Record<string, Buffer> = {};

  for (const entry of entries) {
    if (!entry.isDirectory) {
      // Normalize entry name (strip leading slash or ./ if any)
      const name = entry.entryName.replace(/^(\.\/|\/)/, '');
      fileBuffers[name] = entry.getData();
    }
  }

  // Check required files
  for (const req of REQUIRED_FILES) {
    if (!fileBuffers[req]) {
      throw new PackMalformedError(`Required file missing from evidence pack: ${req}`);
    }
  }

  // Parse manifest.json
  const manifestRaw = fileBuffers['manifest.json'].toString('utf8');
  let manifest: PackManifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    throw new PackMalformedError('manifest.json is not valid JSON');
  }

  if (manifest.schema_version !== '1.0') {
    throw new PackMalformedError(
      `Unsupported manifest schema_version: expected "1.0", got "${manifest.schema_version}"`,
    );
  }

  // Validate file integrity hashes if manifest.files is present
  if (manifest.files && typeof manifest.files === 'object') {
    for (const [fileName, meta] of Object.entries(manifest.files)) {
      if (meta && meta.sha256 && fileBuffers[fileName]) {
        const actualHash = `sha256:${sha256Hex(fileBuffers[fileName])}`;
        const expectedHash = meta.sha256.startsWith('sha256:')
          ? meta.sha256
          : `sha256:${meta.sha256}`;
        if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
          throw new PackMalformedError(
            `File integrity hash mismatch for ${fileName}: expected ${expectedHash}, computed ${actualHash}`,
          );
        }
      }
    }
  }

  // Parse bundle.json
  const bundleRaw = fileBuffers['bundle.json'].toString('utf8');
  let bundle: Record<string, unknown>;
  try {
    bundle = JSON.parse(bundleRaw);
  } catch {
    throw new PackMalformedError('bundle.json is not valid JSON');
  }

  // Parse commitment.json
  const commitmentRaw = fileBuffers['commitment.json'].toString('utf8');
  let commitment: UnpackedPack['commitment'];
  try {
    commitment = JSON.parse(commitmentRaw);
  } catch {
    throw new PackMalformedError('commitment.json is not valid JSON');
  }
  if (!commitment.record || typeof commitment.record !== 'object' || !commitment.signature) {
    throw new PackMalformedError('commitment.json must contain record object and signature string');
  }

  // Parse attestation.json
  const attestationRaw = fileBuffers['attestation.json'].toString('utf8');
  let attestation: UnpackedPack['attestation'];
  try {
    attestation = JSON.parse(attestationRaw);
  } catch {
    throw new PackMalformedError('attestation.json is not valid JSON');
  }
  if (!attestation.record || typeof attestation.record !== 'object' || !attestation.signature) {
    throw new PackMalformedError(
      'attestation.json must contain record object and signature string',
    );
  }

  // Parse client_pubkey.pem
  const clientPubkeyPem = fileBuffers['client_pubkey.pem'].toString('utf8');
  if (
    !clientPubkeyPem.includes('BEGIN PUBLIC KEY') ||
    !clientPubkeyPem.includes('END PUBLIC KEY')
  ) {
    throw new PackMalformedError('client_pubkey.pem is not a valid PEM public key');
  }

  // Parse inclusion_proof_commitment.json
  let inclusionProofCommitment: UnpackedPack['inclusionProofCommitment'];
  try {
    inclusionProofCommitment = JSON.parse(
      fileBuffers['inclusion_proof_commitment.json'].toString('utf8'),
    );
  } catch {
    throw new PackMalformedError('inclusion_proof_commitment.json is not valid JSON');
  }
  if (
    typeof inclusionProofCommitment.leaf_index !== 'number' ||
    typeof inclusionProofCommitment.tree_size !== 'number' ||
    !inclusionProofCommitment.leaf_hash ||
    !Array.isArray(inclusionProofCommitment.path)
  ) {
    throw new PackMalformedError('inclusion_proof_commitment.json is malformed');
  }

  // Parse inclusion_proof_attestation.json
  let inclusionProofAttestation: UnpackedPack['inclusionProofAttestation'];
  try {
    inclusionProofAttestation = JSON.parse(
      fileBuffers['inclusion_proof_attestation.json'].toString('utf8'),
    );
  } catch {
    throw new PackMalformedError('inclusion_proof_attestation.json is not valid JSON');
  }
  if (
    typeof inclusionProofAttestation.leaf_index !== 'number' ||
    typeof inclusionProofAttestation.tree_size !== 'number' ||
    !inclusionProofAttestation.leaf_hash ||
    !Array.isArray(inclusionProofAttestation.path)
  ) {
    throw new PackMalformedError('inclusion_proof_attestation.json is malformed');
  }

  // Parse signed_tree_head.json
  let signedTreeHead: UnpackedPack['signedTreeHead'];
  try {
    signedTreeHead = JSON.parse(fileBuffers['signed_tree_head.json'].toString('utf8'));
  } catch {
    throw new PackMalformedError('signed_tree_head.json is not valid JSON');
  }
  if (
    !signedTreeHead.record ||
    typeof signedTreeHead.record !== 'object' ||
    typeof signedTreeHead.record.tree_size !== 'number' ||
    !signedTreeHead.record.root_hash ||
    !signedTreeHead.signature
  ) {
    throw new PackMalformedError('signed_tree_head.json is malformed');
  }

  return {
    manifest,
    manifestRaw,
    bundle,
    bundleRaw,
    commitment,
    commitmentRaw,
    attestation,
    attestationRaw,
    clientPubkeyPem,
    inclusionProofCommitment,
    inclusionProofAttestation,
    signedTreeHead,
    fileBuffers,
  };
}
