/**
 * Client-side bundle verification: recompute SHA-256 over the RFC 8785 canonical form of the
 * delivered bundle and compare it with the hash the server committed to.
 *
 * This is a fast path, not a substitute for the independent verifier: it runs in code the server
 * served, so a dishonest server could ship a script that always says "match". It catches the
 * crudest attack (a bundle that differs from its own commitment) before the user can act.
 */

export interface Commitment {
  bundle_hash: string;
  nonce: string;
  expires_at: string;
  [key: string]: unknown;
}

export interface BundlePayload {
  bundle: BundleData;
  bundle_hash: string;
  commitment: Commitment;
  commitment_hash: string;
  signature: string;
  nonce: string;
}

export interface BundleData {
  markup: string;
  css: string;
  critical_region: string;
  region_policy: string;
  [key: string]: unknown;
}

/** RFC 8785 canonical JSON. JS number and string serialisation already match the RFC. */
export function jcs(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('non-finite number');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(jcs).join(',') + ']';
  }
  const record = value as Record<string, unknown>;
  // Default sort compares UTF-16 code units, which is exactly the order RFC 8785 requires.
  const keys = Object.keys(record).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + jcs(record[k])).join(',') + '}';
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type Verification = { ok: true } | { ok: false; reason: string };

export async function verifyBundle(payload: BundlePayload): Promise<Verification> {
  try {
    const actual = 'sha256:' + (await sha256Hex(jcs(payload.bundle)));
    if (actual !== payload.commitment.bundle_hash) {
      return { ok: false, reason: 'The page does not match what the server committed to.' };
    }
    if (actual !== payload.bundle_hash) {
      return { ok: false, reason: 'The bundle hash is inconsistent.' };
    }
    const commitmentHash = 'sha256:' + (await sha256Hex(jcs(payload.commitment)));
    if (commitmentHash !== payload.commitment_hash) {
      return { ok: false, reason: 'The commitment is inconsistent.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'The page could not be verified.' };
  }
}

/**
 * Defence in depth: the sealed markup is hash-verified and the server refuses scripts and inline
 * handlers when sealing, but the client strips them too before inserting anything into the page.
 */
export function sanitizeSealedMarkup(markup: string): string {
  const doc = new DOMParser().parseFromString(`<body>${markup}</body>`, 'text/html');
  doc
    .querySelectorAll('script, iframe, object, embed, link, meta, base')
    .forEach((n) => n.remove());
  doc.body.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const v = attr.value.trim().toLowerCase();
      if (attr.name.startsWith('on') || v.startsWith('javascript:')) el.removeAttribute(attr.name);
    }
  });
  return doc.body.innerHTML;
}
