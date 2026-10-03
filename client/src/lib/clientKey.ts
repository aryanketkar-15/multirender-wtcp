import { sha256Hex } from './bundle';

/**
 * The session-bound browser key. ECDSA P-256, non-extractable: script can sign with it but can
 * never read the private key out. It signs the attestation in a later phase; for now its public
 * fingerprint is registered with the server so commitments bind to it.
 */
let keyPair: CryptoKeyPair | null = null;

export async function getClientKey(): Promise<CryptoKeyPair> {
  keyPair ??= await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ]);
  return keyPair;
}

/** `sha256:` plus the hex digest of the SubjectPublicKeyInfo encoding of the public key. */
export async function fingerprint(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', key);
  const bytes = new Uint8Array(spki);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return (
    'sha256:' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  );
}

export function resetClientKeyForTests(): void {
  keyPair = null;
}

// Re-exported so callers need one import for hashing and key handling.
export { sha256Hex };
