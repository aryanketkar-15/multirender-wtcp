import { Verdict } from '../verdicts';
import type { StageResult, VerificationOptions, VerificationResult } from '../verdicts';
import { canonicalJson } from './jcs';
import { publicKeyFingerprint, sha256Prefixed, verifyEcdsaP256, verifyEd25519 } from './crypto';
import { computeLeafHash, verifyAgainstHead } from './merkle';
import { checkRegionPolicy } from './regionPolicy';
import { isRecognisedAttestor } from './registry';
import { unpackPack } from './unpack';

/**
 * Execute independent verifier stages 1 through 10.
 *
 * Stage 1: Schema & Unpack -> MALFORMED_PACK
 * Stage 2: Server Signature -> SERVER_SIGNATURE_INVALID
 * Stage 3: Client Signature -> CLIENT_SIGNATURE_INVALID
 * Stage 4: Key Binding -> KEY_BINDING_INVALID
 * Stage 5: Bundle Hash -> BUNDLE_TAMPERED
 * Stage 6: Commitment Binding -> COMMITMENT_BINDING_INVALID
 * Stage 7: Nonce and Window -> REPLAY_DETECTED
 * Stage 8: Merkle Proofs and Leaf Ordering -> MERKLE_PROOF_INVALID
 * Stage 9: Region Policy -> REGION_POLICY_VIOLATION
 * Stage 10: Attestor Registry -> ATTESTOR_UNRECOGNISED
 *
 * If stages 1-10 pass: PROCEEDS_TO_RENDER
 */
export function verifyPackStages1To10(
  zipBuffer: Buffer,
  options: VerificationOptions = {},
): VerificationResult {
  const stages: StageResult[] = [];

  // ==========================================
  // STAGE 1: Schema & Unpack
  // ==========================================
  let pack;
  try {
    pack = unpackPack(zipBuffer);
    stages.push({
      stage: 1,
      name: 'Schema & Unpack',
      ok: true,
      message: 'Archive parsed and all 8 required files present; manifest schema 1.0 valid.',
    });
  } catch (err) {
    stages.push({
      stage: 1,
      name: 'Schema & Unpack',
      ok: false,
      message: (err as Error).message,
    });
    return {
      ok: false,
      verdict: Verdict.MALFORMED_PACK,
      passedStages: 0,
      failedStage: 1,
      stages,
      message: (err as Error).message,
    };
  }

  // ==========================================
  // STAGE 2: Server Signature
  // ==========================================
  const serverPublicKeyHex = options.serverPublicKeyHex ?? process.env.SERVER_PUBLIC_KEY;
  if (!serverPublicKeyHex) {
    stages.push({
      stage: 2,
      name: 'Server Signature',
      ok: false,
      message: 'Trusted server public key not provided to verifier.',
    });
    return {
      ok: false,
      verdict: Verdict.SERVER_SIGNATURE_INVALID,
      passedStages: 1,
      failedStage: 2,
      stages,
      message: 'Trusted server public key not provided.',
    };
  }

  const canonicalCommitment = canonicalJson(pack.commitment.record);
  const serverSigOk = verifyEd25519(
    canonicalCommitment,
    pack.commitment.signature,
    serverPublicKeyHex,
  );

  if (!serverSigOk) {
    stages.push({
      stage: 2,
      name: 'Server Signature',
      ok: false,
      message: 'Ed25519 signature on commitment.record failed verification.',
    });
    return {
      ok: false,
      verdict: Verdict.SERVER_SIGNATURE_INVALID,
      passedStages: 1,
      failedStage: 2,
      stages,
      message: 'Ed25519 signature on commitment.record failed verification.',
    };
  }
  stages.push({
    stage: 2,
    name: 'Server Signature',
    ok: true,
    message: 'Server Ed25519 signature verified against trusted public key.',
  });

  // ==========================================
  // STAGE 3: Client Signature
  // ==========================================
  const canonicalAttestation = canonicalJson(pack.attestation.record);
  const clientSigOk = verifyEcdsaP256(
    canonicalAttestation,
    pack.attestation.signature,
    pack.clientPubkeyPem,
  );

  if (!clientSigOk) {
    stages.push({
      stage: 3,
      name: 'Client Signature',
      ok: false,
      message: 'ECDSA P-256 signature on attestation.record failed verification.',
    });
    return {
      ok: false,
      verdict: Verdict.CLIENT_SIGNATURE_INVALID,
      passedStages: 2,
      failedStage: 3,
      stages,
      message: 'ECDSA P-256 signature on attestation.record failed verification.',
    };
  }
  stages.push({
    stage: 3,
    name: 'Client Signature',
    ok: true,
    message: 'Client ECDSA P-256 signature verified against client public key.',
  });

  // ==========================================
  // STAGE 4: Key Binding
  // ==========================================
  const computedFingerprint = publicKeyFingerprint(pack.clientPubkeyPem);
  const expectedFingerprint = String(pack.commitment.record.client_pubkey_fpr ?? '');

  if (
    !computedFingerprint ||
    computedFingerprint.toLowerCase() !== expectedFingerprint.toLowerCase()
  ) {
    stages.push({
      stage: 4,
      name: 'Key Binding',
      ok: false,
      message: `Client public key fingerprint (${computedFingerprint}) does not match commitment (${expectedFingerprint}).`,
    });
    return {
      ok: false,
      verdict: Verdict.KEY_BINDING_INVALID,
      passedStages: 3,
      failedStage: 4,
      stages,
      message: 'Client key fingerprint mismatch.',
    };
  }
  stages.push({
    stage: 4,
    name: 'Key Binding',
    ok: true,
    message: 'Client public key fingerprint correctly bound to commitment.',
  });

  // ==========================================
  // STAGE 5: Bundle Hash
  // ==========================================
  const canonicalBundle = canonicalJson(pack.bundle);
  const computedBundleHash = sha256Prefixed(canonicalBundle);
  const expectedBundleHash = String(pack.commitment.record.bundle_hash ?? '');

  if (computedBundleHash.toLowerCase() !== expectedBundleHash.toLowerCase()) {
    stages.push({
      stage: 5,
      name: 'Bundle Hash',
      ok: false,
      message: `Bundle hash (${computedBundleHash}) does not match commitment (${expectedBundleHash}).`,
    });
    return {
      ok: false,
      verdict: Verdict.BUNDLE_TAMPERED,
      passedStages: 4,
      failedStage: 5,
      stages,
      message: 'Bundle content has been tampered with or does not match commitment.',
    };
  }
  stages.push({
    stage: 5,
    name: 'Bundle Hash',
    ok: true,
    message: 'Bundle hash matches commitment bundle_hash.',
  });

  // ==========================================
  // STAGE 6: Commitment Binding
  // ==========================================
  const computedCommitmentHash = sha256Prefixed(canonicalCommitment);
  const expectedCommitmentHash = String(pack.attestation.record.commitment_hash ?? '');

  if (computedCommitmentHash.toLowerCase() !== expectedCommitmentHash.toLowerCase()) {
    stages.push({
      stage: 6,
      name: 'Commitment Binding',
      ok: false,
      message: `Attestation commitment_hash (${expectedCommitmentHash}) does not match computed commitment hash (${computedCommitmentHash}).`,
    });
    return {
      ok: false,
      verdict: Verdict.COMMITMENT_BINDING_INVALID,
      passedStages: 5,
      failedStage: 6,
      stages,
      message: 'Attestation is bound to a different commitment record.',
    };
  }
  stages.push({
    stage: 6,
    name: 'Commitment Binding',
    ok: true,
    message: 'Attestation correctly references the commitment record.',
  });

  // ==========================================
  // STAGE 7: Nonce & Window
  // ==========================================
  const attestationNonce = String(pack.attestation.record.nonce ?? '');
  const commitmentNonce = String(pack.commitment.record.nonce ?? '');

  if (attestationNonce !== commitmentNonce || !attestationNonce) {
    stages.push({
      stage: 7,
      name: 'Nonce & Window',
      ok: false,
      message: `Nonce mismatch: attestation nonce (${attestationNonce}) vs commitment nonce (${commitmentNonce}).`,
    });
    return {
      ok: false,
      verdict: Verdict.REPLAY_DETECTED,
      passedStages: 6,
      failedStage: 7,
      stages,
      message: 'Nonce mismatch between attestation and commitment.',
    };
  }

  const validUntilStr = String(pack.commitment.record.valid_until ?? '');
  const clientTsStr = String(pack.attestation.record.client_ts ?? '');

  if (validUntilStr && clientTsStr) {
    const validUntilTime = new Date(validUntilStr).getTime();
    const clientTsTime = new Date(clientTsStr).getTime();
    if (
      Number.isNaN(validUntilTime) ||
      Number.isNaN(clientTsTime) ||
      clientTsTime > validUntilTime
    ) {
      stages.push({
        stage: 7,
        name: 'Nonce & Window',
        ok: false,
        message: `Attestation client_ts (${clientTsStr}) is outside commitment validity window (${validUntilStr}).`,
      });
      return {
        ok: false,
        verdict: Verdict.REPLAY_DETECTED,
        passedStages: 6,
        failedStage: 7,
        stages,
        message: 'Commitment validity window expired prior to client interaction.',
      };
    }
  }
  stages.push({
    stage: 7,
    name: 'Nonce & Window',
    ok: true,
    message: 'Nonces match and interaction is within validity window.',
  });

  // ==========================================
  // STAGE 8: Merkle Proofs & Ordering
  // ==========================================
  const canonicalSth = canonicalJson(pack.signedTreeHead.record);
  const sthSigOk = verifyEd25519(canonicalSth, pack.signedTreeHead.signature, serverPublicKeyHex);

  if (!sthSigOk) {
    stages.push({
      stage: 8,
      name: 'Merkle Proofs',
      ok: false,
      message: 'Ed25519 signature on signed_tree_head failed verification.',
    });
    return {
      ok: false,
      verdict: Verdict.MERKLE_PROOF_INVALID,
      passedStages: 7,
      failedStage: 8,
      stages,
      message: 'Signed tree head signature is invalid.',
    };
  }

  // Leaf ordering check: commitment must be logged strictly before attestation
  const idxCommitment = pack.inclusionProofCommitment.leaf_index;
  const idxAttestation = pack.inclusionProofAttestation.leaf_index;

  if (idxCommitment >= idxAttestation) {
    stages.push({
      stage: 8,
      name: 'Merkle Proofs',
      ok: false,
      message: `Leaf order inverted: commitment leaf ${idxCommitment} must precede attestation leaf ${idxAttestation}.`,
    });
    return {
      ok: false,
      verdict: Verdict.MERKLE_PROOF_INVALID,
      passedStages: 7,
      failedStage: 8,
      stages,
      message: 'Leaf order inverted in Merkle log.',
    };
  }

  // Commitment inclusion proof check
  const commProofOk = verifyAgainstHead(pack.inclusionProofCommitment, pack.signedTreeHead.record);
  if (!commProofOk) {
    stages.push({
      stage: 8,
      name: 'Merkle Proofs',
      ok: false,
      message: 'Inclusion proof for commitment leaf failed verification against signed tree head.',
    });
    return {
      ok: false,
      verdict: Verdict.MERKLE_PROOF_INVALID,
      passedStages: 7,
      failedStage: 8,
      stages,
      message: 'Commitment inclusion proof invalid.',
    };
  }

  // Attestation inclusion proof check
  const attProofOk = verifyAgainstHead(pack.inclusionProofAttestation, pack.signedTreeHead.record);
  if (!attProofOk) {
    stages.push({
      stage: 8,
      name: 'Merkle Proofs',
      ok: false,
      message: 'Inclusion proof for attestation leaf failed verification against signed tree head.',
    });
    return {
      ok: false,
      verdict: Verdict.MERKLE_PROOF_INVALID,
      passedStages: 7,
      failedStage: 8,
      stages,
      message: 'Attestation inclusion proof invalid.',
    };
  }

  // If leaf records are present, verify that the leaf hashes match the canonical leaf records
  if (pack.inclusionProofCommitment.leaf_record) {
    const computedCommLeafHash = computeLeafHash(
      canonicalJson(pack.inclusionProofCommitment.leaf_record),
    );
    if (
      computedCommLeafHash.toLowerCase() !== pack.inclusionProofCommitment.leaf_hash.toLowerCase()
    ) {
      stages.push({
        stage: 8,
        name: 'Merkle Proofs',
        ok: false,
        message: 'Commitment leaf_record canonical hash does not match leaf_hash in proof.',
      });
      return {
        ok: false,
        verdict: Verdict.MERKLE_PROOF_INVALID,
        passedStages: 7,
        failedStage: 8,
        stages,
        message: 'Commitment leaf record hash mismatch.',
      };
    }
  }

  if (pack.inclusionProofAttestation.leaf_record) {
    const computedAttLeafHash = computeLeafHash(
      canonicalJson(pack.inclusionProofAttestation.leaf_record),
    );
    if (
      computedAttLeafHash.toLowerCase() !== pack.inclusionProofAttestation.leaf_hash.toLowerCase()
    ) {
      stages.push({
        stage: 8,
        name: 'Merkle Proofs',
        ok: false,
        message: 'Attestation leaf_record canonical hash does not match leaf_hash in proof.',
      });
      return {
        ok: false,
        verdict: Verdict.MERKLE_PROOF_INVALID,
        passedStages: 7,
        failedStage: 8,
        stages,
        message: 'Attestation leaf record hash mismatch.',
      };
    }
  }

  stages.push({
    stage: 8,
    name: 'Merkle Proofs',
    ok: true,
    message:
      'Signed tree head verified; commitment precedes attestation in log; both inclusion proofs verified.',
  });

  // ==========================================
  // STAGE 9: Region Policy
  // ==========================================
  const regionViolations = checkRegionPolicy(pack.bundle, pack.attestation.record);
  if (regionViolations.length > 0) {
    stages.push({
      stage: 9,
      name: 'Region Policy',
      ok: false,
      message: `Region policy violations: ${regionViolations.join('; ')}`,
    });
    return {
      ok: false,
      verdict: Verdict.REGION_POLICY_VIOLATION,
      passedStages: 8,
      failedStage: 9,
      stages,
      message: `Region policy violation: ${regionViolations.join('; ')}`,
    };
  }
  stages.push({
    stage: 9,
    name: 'Region Policy',
    ok: true,
    message: 'Committed bundle satisfies consent/v1 region policy and action target.',
  });

  // ==========================================
  // STAGE 10: Attestor Registry
  // ==========================================
  const attestorHash = String(pack.attestation.record.attestor_hash ?? '');
  const attestorRecognised = isRecognisedAttestor(attestorHash, options.recognizedAttestors);

  if (!attestorRecognised) {
    stages.push({
      stage: 10,
      name: 'Attestor Registry',
      ok: false,
      message: `Attestor hash ${attestorHash} is not recognized in independent verifier registry.`,
    });
    return {
      ok: false,
      verdict: Verdict.ATTESTOR_UNRECOGNISED,
      passedStages: 9,
      failedStage: 10,
      stages,
      message: `Attestor hash ${attestorHash} is not recognized.`,
    };
  }
  stages.push({
    stage: 10,
    name: 'Attestor Registry',
    ok: true,
    message: 'Attestor Module hash matches trusted independent release build.',
  });

  // ==========================================
  // STAGES 1-10 PASSED -> PROCEEDS_TO_RENDER
  // ==========================================
  return {
    ok: true,
    verdict: Verdict.PROCEEDS_TO_RENDER,
    passedStages: 10,
    stages,
    message: 'All stages 1-10 cheap checks passed successfully; proceeds to render stage.',
  };
}
