import fixture from './fixtures/php-bundle.json';
import { jcs, sanitizeSealedMarkup, sha256Hex, verifyBundle } from '../src/lib/bundle';
import type { BundlePayload } from '../src/lib/bundle';
import { fingerprint, getClientKey, resetClientKeyForTests } from '../src/lib/clientKey';

async function payload(): Promise<BundlePayload> {
  const commitment = fixture.commitment as unknown as BundlePayload['commitment'];
  return {
    bundle: JSON.parse(JSON.stringify(fixture.bundle)) as unknown as BundlePayload['bundle'],
    bundle_hash: fixture.bundle_hash,
    commitment,
    commitment_hash: 'sha256:' + (await sha256Hex(jcs(commitment))),
    signature: 'x',
    nonce: commitment.nonce,
  };
}

describe('canonicalisation agrees with the PHP server (cross-implementation)', () => {
  it('produces byte-identical canonical JSON for the sealed bundle', () => {
    expect(jcs(fixture.bundle)).toBe(fixture.canonical);
  });

  it('produces the same SHA-256 the server computed', async () => {
    expect('sha256:' + (await sha256Hex(jcs(fixture.bundle)))).toBe(fixture.bundle_hash);
  });

  it('agrees on numbers, integers and non-ASCII text', () => {
    expect(jcs(fixture.commitment)).toBe(fixture.commitment_canonical);
  });

  it('matches RFC 8785 section 3.2.4', () => {
    const input = {
      numbers: [Number('333333333.33333329'), 1e30, 4.5, 2e-3, 0.000000000000000000000000001],
      string: '\u20ac$\u000F\u000aA\'B"\\\\"/',
      literals: [null, true, false],
    };
    expect(jcs(input)).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],' +
        '"string":"\u20ac$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
    );
  });

  it('sorts members by UTF-16 code units', () => {
    const keys = ['\u20ac', '\r', '\ufb33', '1', '\u{1f600}', '\u0080', '\u00f6'];
    const obj = Object.fromEntries(keys.map((k) => [k, 1]));
    const order = [...jcs(obj).matchAll(/"((?:\\.|[^"\\])*)":/g)].map((m) =>
      JSON.parse(`"${m[1]}"`),
    );
    expect(order).toEqual(['\r', '1', '\u0080', '\u00f6', '\u20ac', '\u{1f600}', '\ufb33']);
  });

  it('refuses non-finite numbers', () => {
    expect(() => jcs({ a: NaN })).toThrow();
  });
});

describe('verifyBundle', () => {
  it('accepts an untouched bundle', async () => {
    expect(await verifyBundle(await payload())).toEqual({ ok: true });
  });

  it('refuses a bundle whose disclosure differs by one character', async () => {
    const p = await payload();
    p.bundle.markup = p.bundle.markup.replace('advertising', 'advertisinG');
    const verdict = await verifyBundle(p);
    expect(verdict.ok).toBe(false);
  });

  it('refuses a swapped bundle even when bundle_hash was rewritten to match', async () => {
    const p = await payload();
    p.bundle.markup += '<p>extra</p>';
    p.bundle_hash = 'sha256:' + (await sha256Hex(jcs(p.bundle)));
    expect((await verifyBundle(p)).ok).toBe(false); // the commitment still names the original hash
  });

  it('refuses an inconsistent commitment hash', async () => {
    const p = await payload();
    p.commitment_hash = 'sha256:' + '0'.repeat(64);
    expect((await verifyBundle(p)).ok).toBe(false);
  });

  it('fails closed on malformed input', async () => {
    expect((await verifyBundle({} as BundlePayload)).ok).toBe(false);
  });
});

describe('sanitizeSealedMarkup', () => {
  it('strips scripts, inline handlers and javascript URLs but keeps the content', () => {
    const out = sanitizeSealedMarkup(
      '<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">l</a><button id="b">OK</button>',
    );
    expect(out).not.toMatch(/script|onclick|javascript:/i);
    expect(out).toContain('Hi');
    expect(out).toContain('id="b"');
  });
});

describe('client key', () => {
  beforeEach(resetClientKeyForTests);

  it('is non-extractable and yields a stable sha256 fingerprint', async () => {
    const pair = await getClientKey();
    expect(pair.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('pkcs8', pair.privateKey)).rejects.toThrow();
    const a = await fingerprint(pair.publicKey);
    expect(a).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(await fingerprint(pair.publicKey)).toBe(a);
  });

  it('reuses one key per page and differs between pages', async () => {
    const first = await getClientKey();
    expect(await getClientKey()).toBe(first);
    resetClientKeyForTests();
    expect(await fingerprint((await getClientKey()).publicKey)).not.toBe(
      await fingerprint(first.publicKey),
    );
  });
});
