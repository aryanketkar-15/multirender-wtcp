/**
 * Verdict codes and verification types for the independent MRA verifier.
 * Stages 1-10 perform cheap checks; Stage 11 (Milestone 5.3) performs headless re-render.
 */

export const Verdict = {
  MALFORMED_PACK: 'MALFORMED_PACK',
  SERVER_SIGNATURE_INVALID: 'SERVER_SIGNATURE_INVALID',
  CLIENT_SIGNATURE_INVALID: 'CLIENT_SIGNATURE_INVALID',
  KEY_BINDING_INVALID: 'KEY_BINDING_INVALID',
  BUNDLE_TAMPERED: 'BUNDLE_TAMPERED',
  COMMITMENT_BINDING_INVALID: 'COMMITMENT_BINDING_INVALID',
  REPLAY_DETECTED: 'REPLAY_DETECTED',
  MERKLE_PROOF_INVALID: 'MERKLE_PROOF_INVALID',
  REGION_POLICY_VIOLATION: 'REGION_POLICY_VIOLATION',
  ATTESTOR_UNRECOGNISED: 'ATTESTOR_UNRECOGNISED',
  PROCEEDS_TO_RENDER: 'PROCEEDS_TO_RENDER',
  DIGEST_MISMATCH: 'DIGEST_MISMATCH',
  RENDER_DIGEST_MISMATCH: 'DIGEST_MISMATCH',
  CONTEXT_MISMATCH: 'CONTEXT_MISMATCH',
  RENDER_FAILED: 'RENDER_FAILED',
  VERIFIED: 'VERIFIED',
} as const;

export type VerdictType = (typeof Verdict)[keyof typeof Verdict];

export interface NodeDifference {
  field: string;
  attested: unknown;
  recomputed: unknown;
}

export interface MismatchedNode {
  index: number;
  role: string;
  name?: string;
  text?: string;
  differences: Record<string, { attested: unknown; recomputed: unknown }>;
  summary: string;
}

export interface DiffResult {
  hasMismatch: boolean;
  totalAttestedNodes: number;
  totalRecomputedNodes: number;
  mismatchedNodes: MismatchedNode[];
  summary: string;
}

export interface StageResult {
  stage: number;
  name: string;
  ok: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

export interface VerificationResult {
  ok: boolean;
  verdict: VerdictType;
  passedStages: number;
  failedStage?: number;
  stages: StageResult[];
  message: string;
  diff?: DiffResult;
  recomputedDigests?: {
    critical_region_digest: string;
    context_digest: string;
  };
}

export interface ManifestFile {
  sha256?: string;
  bytes?: number;
}

export interface PackManifest {
  schema_version: string;
  pack_id: string;
  created_at: string;
  server_key_id?: string;
  client_pubkey_fpr?: string;
  hashes?: {
    bundle_hash?: string;
    commitment_hash?: string;
    attestation_hash?: string;
    client_pubkey_fpr?: string;
  };
  tree?: {
    tree_size: number;
    root_hash: string;
    commitment_leaf_index: number;
    attestation_leaf_index: number;
  };
  components?: Record<string, string>;
  files?: Record<string, ManifestFile>;
}

export interface UnpackedPack {
  manifest: PackManifest;
  manifestRaw: string;
  bundle: Record<string, unknown>;
  bundleRaw: string;
  commitment: {
    record: Record<string, unknown>;
    signature: string;
    commitment_hash?: string;
    key_id?: string;
  };
  commitmentRaw: string;
  attestation: {
    record: Record<string, unknown>;
    signature: string;
    attestation_hash?: string;
  };
  attestationRaw: string;
  clientPubkeyPem: string;
  inclusionProofCommitment: {
    leaf_index: number;
    tree_size: number;
    leaf_hash: string;
    path: string[];
    leaf_record?: Record<string, unknown>;
  };
  inclusionProofAttestation: {
    leaf_index: number;
    tree_size: number;
    leaf_hash: string;
    path: string[];
    leaf_record?: Record<string, unknown>;
  };
  signedTreeHead: {
    record: {
      v: string;
      type: string;
      tree_size: number;
      root_hash: string;
      timestamp: string;
      key_id: string;
    };
    signature: string;
  };
  fileBuffers: Record<string, Buffer>;
}

export interface VerificationOptions {
  /**
   * Trusted server Ed25519 public key as raw 64-hex string or SPKI PEM.
   * Trust anchors must be supplied out-of-band and NEVER read from inside the pack.
   */
  serverPublicKeyHex?: string;
  /**
   * Recognized attestor hash values (prefixed with `sha256:`).
   */
  recognizedAttestors?: string[];
  /**
   * Optional reference clock time for replay / expiry checks (ISO 8601).
   */
  referenceTime?: string;
}
