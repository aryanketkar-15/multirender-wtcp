/**
 * Plain-language metadata for all MRA verifier verdicts.
 * Designed for non-engineers (judges, examiners, compliance auditors)
 * to understand the verdict within 15 seconds.
 */

export interface VerdictMeta {
  code: string;
  category: 'success' | 'attack' | 'tamper' | 'invalid';
  badgeLabel: string;
  title: string;
  summary: string;
  legalSignificance: string;
}

export const VERDICT_METADATA: Record<string, VerdictMeta> = {
  VERIFIED: {
    code: 'VERIFIED',
    category: 'success',
    badgeLabel: 'VERIFIED',
    title: 'Evidence verified: the committed notice matches what the browser attested',
    summary:
      'The critical region, re-rendered from the bundle the server committed to, matches the digest the user’s browser signed. Every signature, binding and log proof also checked out. Content outside the critical region was not compared.',
    legalSignificance:
      'Both sides’ records agree on the critical region, which makes it hard for either to deny it later. It does not by itself settle a legal dispute, and it does not cover content outside the critical region.',
  },
  DIGEST_MISMATCH: {
    code: 'DIGEST_MISMATCH',
    category: 'attack',
    badgeLabel: 'MISMATCH',
    title: 'The committed notice and the attested page differ',
    summary:
      'Re-rendering the notice the server committed to gives a different result from the page the user’s browser attested. The elements that differ are listed below.',
    legalSignificance:
      'The page the user’s browser attested differs from the bundle the server committed to. The cause may be the server, a script or extension that changed the page after it loaded, or a difference in environment such as fonts or viewport. The evidence shows that it differs and where, not who did it.',
  },
  RENDER_DIGEST_MISMATCH: {
    code: 'RENDER_DIGEST_MISMATCH',
    category: 'attack',
    badgeLabel: 'MISMATCH',
    title: 'The committed notice and the attested page differ',
    summary:
      'Re-rendering the notice the server committed to gives a different result from the page the user’s browser attested. The elements that differ are listed below.',
    legalSignificance:
      'The page the user’s browser attested differs from the bundle the server committed to. The cause may be the server, a script or extension that changed the page after it loaded, or a difference in environment such as fonts or viewport. The evidence shows that it differs and where, not who did it.',
  },
  CONTEXT_MISMATCH: {
    code: 'CONTEXT_MISMATCH',
    category: 'attack',
    badgeLabel: 'ATTACK DETECTED',
    title: 'Visual Context Manipulation Detected',
    summary:
      'The critical consent text matched, but external visual layers, deceptive overlays, or surrounding elements altered the user’s perception when consenting.',
    legalSignificance:
      'Something around the critical region differs from what was committed, for example an overlay. The context digest also covers the surrounding application, so check the details before concluding that an attack took place.',
  },
  SERVER_SIGNATURE_INVALID: {
    code: 'SERVER_SIGNATURE_INVALID',
    category: 'tamper',
    badgeLabel: 'TAMPERING DETECTED',
    title: 'Server Signature Invalid or Forged',
    summary:
      'The server’s Ed25519 signature on the commitment record does not verify against the trusted server public key. The commitment may have been forged or altered.',
    legalSignificance:
      'The server cannot be proven to have committed to this render bundle before the interaction.',
  },
  CLIENT_SIGNATURE_INVALID: {
    code: 'CLIENT_SIGNATURE_INVALID',
    category: 'tamper',
    badgeLabel: 'TAMPERING DETECTED',
    title: 'User Signature Invalid',
    summary:
      'The user’s cryptographic ECDSA signature on the attestation does not match the client public key in the pack.',
    legalSignificance:
      'The attestation cannot be authenticated to the browser key pair registered for the session.',
  },
  KEY_BINDING_INVALID: {
    code: 'KEY_BINDING_INVALID',
    category: 'tamper',
    badgeLabel: 'TAMPERING DETECTED',
    title: 'Client Key Binding Mismatch',
    summary:
      'The public key fingerprint cited inside the attestation does not match the cryptographic public key attached to the evidence pack.',
    legalSignificance: 'The evidence pack has been spliced or paired with an unrelated public key.',
  },
  BUNDLE_TAMPERED: {
    code: 'BUNDLE_TAMPERED',
    category: 'tamper',
    badgeLabel: 'TAMPERING DETECTED',
    title: 'Committed Bundle Tampered After Signing',
    summary:
      'The HTML/CSS bundle was modified after the server signed its commitment. The SHA-256 hash of the bundle does not match the commitment.',
    legalSignificance:
      'The server or a third party altered the underlying HTML/CSS code after the commitment was sealed.',
  },
  COMMITMENT_BINDING_INVALID: {
    code: 'COMMITMENT_BINDING_INVALID',
    category: 'tamper',
    badgeLabel: 'TAMPERING DETECTED',
    title: 'Commitment Binding Broken',
    summary:
      'The user’s attestation references a commitment that differs from the one enclosed in the pack (mismatched bundle hash, nonce, or key ID).',
    legalSignificance:
      'The attestation does not bind to the specific commitment, breaking the causal chain of custody.',
  },
  REPLAY_DETECTED: {
    code: 'REPLAY_DETECTED',
    category: 'tamper',
    badgeLabel: 'REPLAY DETECTED',
    title: 'Interaction Nonce Expired or Replayed',
    summary:
      'The attestation was submitted outside the allowable 60-second freshness window, or the interaction nonce was reused.',
    legalSignificance:
      'The evidence pack violates freshness constraints, indicating an expired session or replay attempt.',
  },
  MERKLE_PROOF_INVALID: {
    code: 'MERKLE_PROOF_INVALID',
    category: 'tamper',
    badgeLabel: 'LOG PROOF INVALID',
    title: 'Transparency Log Inclusion Proof Failed',
    summary:
      'The Merkle tree audit path for the commitment or attestation does not verify against the Signed Tree Head.',
    legalSignificance: 'The records cannot be proven to exist in the append-only transparency log.',
  },
  REGION_POLICY_VIOLATION: {
    code: 'REGION_POLICY_VIOLATION',
    category: 'tamper',
    badgeLabel: 'POLICY VIOLATION',
    title: 'Critical Region Policy Violation',
    summary:
      'The committed bundle violates structural region policy (e.g., missing the required #consent-dialog container or using prohibited selectors).',
    legalSignificance:
      'The application broke layout guarantees necessary for verifiable attestation.',
  },
  ATTESTOR_UNRECOGNISED: {
    code: 'ATTESTOR_UNRECOGNISED',
    category: 'tamper',
    badgeLabel: 'UNRECOGNIZED ATTESTOR',
    title: 'Unrecognized Attestor Module',
    summary:
      'The attestor module code hash named in the commitment is not recognized in the approved attestor registry.',
    legalSignificance:
      'The measuring code named in the attestation is not a build this verifier recognises.',
  },
  MALFORMED_PACK: {
    code: 'MALFORMED_PACK',
    category: 'invalid',
    badgeLabel: 'MALFORMED PACK',
    title: 'Invalid or Incomplete Evidence Pack Archive',
    summary:
      'The uploaded file is not a valid evidence pack ZIP archive or is missing mandatory files (manifest, bundle, commitment, attestation, or log proofs).',
    legalSignificance: 'The evidence pack is structurally incomplete and cannot be audited.',
  },
  RENDER_FAILED: {
    code: 'RENDER_FAILED',
    category: 'invalid',
    badgeLabel: 'RENDER FAILED',
    title: 'Independent Re-render Execution Failed',
    summary:
      'The independent headless browser was unable to execute the bundle (e.g. malformed markup, script execution failure, or environment initialization failure).',
    legalSignificance:
      'Re-rendering failed due to execution faults rather than a cryptographic mismatch.',
  },
  PROCEEDS_TO_RENDER: {
    code: 'PROCEEDS_TO_RENDER',
    category: 'success',
    badgeLabel: 'CHEAP CHECKS PASSED',
    title: 'Non-render Validation Passed',
    summary:
      'All 10 non-render verification stages passed. The pack is valid for headless re-render.',
    legalSignificance: 'Intermediate verification status.',
  },
  VERIFIER_OFFLINE: {
    code: 'VERIFIER_OFFLINE',
    category: 'invalid',
    badgeLabel: 'SERVICE UNREACHABLE',
    title: 'Independent Verifier Service Offline',
    summary:
      'Could not reach the verifier service on port 8095. Please ensure the independent verifier is running.',
    legalSignificance: 'Service communication error.',
  },
};

export function getVerdictMeta(verdictCode: string): VerdictMeta {
  if (VERDICT_METADATA[verdictCode]) {
    return VERDICT_METADATA[verdictCode];
  }
  return {
    code: verdictCode,
    category: 'invalid',
    badgeLabel: verdictCode,
    title: `Verification Result: ${verdictCode}`,
    summary: `Verification completed with verdict: ${verdictCode}.`,
    legalSignificance: 'Custom or unmapped verdict code.',
  };
}
