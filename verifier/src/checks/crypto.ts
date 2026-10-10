import crypto from 'node:crypto';

/**
 * Compute SHA-256 digest buffer.
 */
export function sha256(data: Buffer | string): Buffer {
  return crypto
    .createHash('sha256')
    .update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data)
    .digest();
}

/**
 * Compute SHA-256 digest as lower-case hex.
 */
export function sha256Hex(data: Buffer | string): string {
  return sha256(data).toString('hex');
}

/**
 * Compute SHA-256 digest prefixed with `sha256:`.
 */
export function sha256Prefixed(data: Buffer | string): string {
  return `sha256:${sha256Hex(data)}`;
}

/**
 * Calculate SPKI fingerprint from PEM:
 * `sha256:` + hex(SHA256(DER(SubjectPublicKeyInfo)))
 * Matches PHP ClientKeyVerifier::fingerprint
 */
export function publicKeyFingerprint(pem: string): string | null {
  const match = pem.match(
    /-----BEGIN PUBLIC KEY-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END PUBLIC KEY-----/,
  );
  if (!match) {
    return null;
  }
  const b64 = match[1].replace(/\s+/g, '');
  const der = Buffer.from(b64, 'base64');
  if (der.length === 0) {
    return null;
  }
  return `sha256:${crypto.createHash('sha256').update(der).digest('hex')}`;
}

/**
 * Verify Ed25519 signature on canonical text using trusted server public key (32-byte raw hex).
 * The signature is expected as unpadded base64url or raw binary base64.
 */
export function verifyEd25519(
  canonicalText: string,
  signatureBase64Url: string,
  serverPublicKeyHex: string,
): boolean {
  try {
    const rawKey = serverPublicKeyHex.replace(/^0x/i, '').trim();
    if (rawKey.length !== 64) {
      return false;
    }
    const x = Buffer.from(rawKey, 'hex').toString('base64url');
    const key = crypto.createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x },
      format: 'jwk',
    });
    const sigBuffer = Buffer.from(signatureBase64Url, 'base64url');
    return crypto.verify(null, Buffer.from(canonicalText, 'utf8'), key, sigBuffer);
  } catch {
    return false;
  }
}

/**
 * Verify ECDSA P-256 signature on canonical text using client public key PEM.
 * WebCrypto produces an unpadded base64url IEEE P1363 (64 bytes: r||s) signature.
 */
export function verifyEcdsaP256(
  canonicalText: string,
  signatureBase64Url: string,
  clientPubkeyPem: string,
): boolean {
  try {
    const sigBuffer = Buffer.from(signatureBase64Url, 'base64url');
    if (sigBuffer.length !== 64) {
      return false;
    }
    return crypto.verify(
      'sha256',
      Buffer.from(canonicalText, 'utf8'),
      {
        key: clientPubkeyPem,
        dsaEncoding: 'ieee-p1363',
      },
      sigBuffer,
    );
  } catch {
    return false;
  }
}
