import { api } from './api';
import { jcs } from './bundle';
import { publicKeyPem, signText } from './clientKey';
import type { Evidence } from './loadAttestor';

export type Action = 'accept' | 'reject';

export interface AttestationEnv {
  engine: string;
  engine_major: string;
  viewport_bucket: string;
  dpr_bucket: string;
  forced_colors: boolean;
  reduced_motion: boolean;
}

/** The client attestation of the design document. Exactly these members, nothing else is signed. */
export interface Attestation {
  v: 'mra/1.0';
  type: 'client_attestation';
  session_id: string;
  commitment_hash: string;
  critical_region_digest: string;
  context_digest: string;
  action: Action;
  action_target: string;
  env: AttestationEnv;
  attestor_hash: string;
  nonce: string;
  client_ts: string;
  client_pubkey: string;
}

export interface SignedAttestation {
  attestation: Attestation;
  signature: string;
}

export interface CommitmentFields {
  session_id: string;
  nonce: string;
  attestor_hash: string;
}

export interface AttestationInput {
  commitment: CommitmentFields;
  /**
   * The signature binds to this, not to the bundle hash. Binding to the commitment ties the
   * attestation to the specific nonce, policy and expiry, so a server cannot replay one honest
   * bundle under a different commitment.
   */
  commitmentHash: string;
  action: Action;
  actionTarget: string;
  /** Digests measured at the moment of the action, never at page load. */
  evidence: Evidence;
  pair: CryptoKeyPair;
  now?: Date;
}

/** Only the recorded environment keys the contract allows, in their contract types. */
function pickEnv(env: Record<string, unknown>): AttestationEnv {
  return {
    engine: String(env.engine ?? 'Unknown'),
    engine_major: String(env.engine_major ?? '0'),
    viewport_bucket: String(env.viewport_bucket ?? 'medium'),
    dpr_bucket: String(env.dpr_bucket ?? '1x'),
    forced_colors: env.forced_colors === true,
    reduced_motion: env.reduced_motion === true,
  };
}

export function isoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Assembles the attestation, canonicalises it (RFC 8785) and signs the canonical bytes. */
export async function createAttestation(input: AttestationInput): Promise<SignedAttestation> {
  const attestation: Attestation = {
    v: 'mra/1.0',
    type: 'client_attestation',
    session_id: input.commitment.session_id,
    commitment_hash: input.commitmentHash,
    critical_region_digest: input.evidence.critical_region_digest,
    context_digest: input.evidence.context_digest,
    action: input.action,
    action_target: input.actionTarget,
    env: pickEnv(input.evidence.env),
    attestor_hash: input.commitment.attestor_hash,
    nonce: input.commitment.nonce,
    client_ts: isoSeconds(input.now ?? new Date()),
    client_pubkey: await publicKeyPem(input.pair.publicKey),
  };
  return { attestation, signature: await signText(input.pair, jcs(attestation)) };
}

export type SubmitResult =
  | { ok: true; attestationHash: string }
  | { ok: false; code: string; message: string; retryable: boolean };

interface SubmitBody {
  attestation_hash?: string;
  error?: string;
  message?: string;
}

const MESSAGES: Record<string, string> = {
  REPLAY_DETECTED: 'This consent has already been recorded.',
  COMMITMENT_EXPIRED: 'This consent page expired. Reload to start again.',
  CLIENT_SIGNATURE_INVALID: 'Your browser signature could not be verified.',
  KEY_BINDING_INVALID: 'This browser key is not registered for your session. Reload and try again.',
  SESSION_MISMATCH: 'This consent belongs to a different session.',
  REGION_POLICY_VIOLATION: 'The consent page did not meet the required form and was not accepted.',
  ATTESTOR_UNRECOGNISED: 'The attestation module is not recognised.',
};

/** Posts a signed attestation. Network trouble is retryable and never silent. */
export async function submitAttestation(signed: SignedAttestation): Promise<SubmitResult> {
  const res = await api.post<SubmitBody>('/api/attest', signed);
  if (res.status === 201 && res.data.attestation_hash) {
    return { ok: true, attestationHash: res.data.attestation_hash };
  }
  if (res.status === 0 || res.status >= 500) {
    return {
      ok: false,
      code: res.status === 0 ? 'NETWORK' : 'SERVER_ERROR',
      message: 'We could not reach the server to record your choice. Nothing was recorded.',
      retryable: true,
    };
  }
  const code = res.data.error ?? 'REJECTED';
  return {
    ok: false,
    code,
    message: MESSAGES[code] ?? 'Your choice could not be recorded.',
    retryable: false,
  };
}
