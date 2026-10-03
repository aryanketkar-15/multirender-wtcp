import { sha256Hex } from './bundle';
import { getCsrfToken } from './api';
import { clearKeys, loadKey, saveKey } from './keyStore';

/**
 * The session-bound browser key: ECDSA P-256, non-extractable. Script can ask it to sign but can
 * never read the private key out, so a compromised page cannot exfiltrate the signing capability.
 *
 * Scope: the key belongs to one server session. The scope is a hash of that session's CSRF token,
 * which changes whenever the session is regenerated (login, OTP verification), so every session
 * gets a distinct key and a stale one is never reused.
 *
 * The WebAuthn tier from the design is not built; this is the WebCrypto tier only.
 */
let cache: { scope: string; pair: CryptoKeyPair } | null = null;

async function currentScope(): Promise<string> {
  return sha256Hex('mra-session-scope:' + (getCsrfToken() ?? 'no-session'));
}

export async function getClientKey(): Promise<CryptoKeyPair> {
  const scope = await currentScope();
  if (cache?.scope === scope) return cache.pair;
  let pair = await loadKey(scope);
  if (pair === null) {
    pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
      'verify',
    ]);
    await saveKey(scope, pair);
  }
  cache = { scope, pair };
  return pair;
}

/** `sha256:` plus the hex digest of the SubjectPublicKeyInfo encoding of the public key. */
export async function fingerprint(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', key);
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(spki));
  return (
    'sha256:' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  );
}

/** PEM (SPKI) of the public key, as carried inside the attestation. */
export async function publicKeyPem(key: CryptoKey): Promise<string> {
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', key));
  let binary = '';
  for (const b of spki) binary += String.fromCharCode(b);
  const body =
    btoa(binary)
      .match(/.{1,64}/g)
      ?.join('\n') ?? '';
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

/** Signs UTF-8 text; returns the IEEE P1363 signature (r||s) as unpadded base64url. */
export async function signText(pair: CryptoKeyPair, text: string): Promise<string> {
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.privateKey,
      new TextEncoder().encode(text),
    ),
  );
  let binary = '';
  for (const b of sig) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Forgets the key everywhere: memory and IndexedDB. Called on logout. */
export async function discardClientKeys(): Promise<void> {
  cache = null;
  await clearKeys();
}

export function resetClientKeyForTests(): void {
  cache = null;
  void clearKeys();
}
