import { jcs } from './jcs';

export interface DigestResult {
  /** RFC 8785 canonical text that was hashed. */
  canonical: string;
  /** `sha256:` followed by 64 lower-case hex characters. */
  digest: string;
}

async function sha256(bytes: BufferSource): Promise<string> {
  const out = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(out)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 over the canonical UTF-8 bytes of the representation. */
export async function digestOf(representation: unknown): Promise<DigestResult> {
  const canonical = jcs(representation);
  return { canonical, digest: 'sha256:' + (await sha256(new TextEncoder().encode(canonical))) };
}

export async function sha256Text(text: string): Promise<string> {
  return 'sha256:' + (await sha256(new TextEncoder().encode(text)));
}
