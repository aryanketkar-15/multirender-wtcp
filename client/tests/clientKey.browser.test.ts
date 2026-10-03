/** @jest-environment node */
import { Lab, describeBrowser } from './browser/harness';
import type { Page } from 'playwright';

describeBrowser('client signing key (T4.1)', () => {
  const lab = new Lab();
  beforeAll(() => lab.start());
  afterAll(() => lab.stop());

  const fpr = (page: Page, csrf: string) =>
    page.evaluate(async (c) => {
      window.MRClient.setCsrfToken(c);
      const pair = await window.MRClient.getClientKey();
      return window.MRClient.fingerprint(pair.publicKey);
    }, csrf);

  async function fresh() {
    const ctx = await lab.context();
    return { ctx, page: await lab.open(ctx) };
  }

  it('generates a keypair whose public key is exportable (T4.1.1)', async () => {
    const { ctx, page } = await fresh();
    const info = await page.evaluate(async () => {
      window.MRClient.setCsrfToken('s1');
      const pair = await window.MRClient.getClientKey();
      return {
        pem: await window.MRClient.publicKeyPem(pair.publicKey),
        algorithm: pair.publicKey.algorithm,
        fpr: await window.MRClient.fingerprint(pair.publicKey),
      };
    });
    expect(info.pem).toMatch(
      /^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+\n-----END PUBLIC KEY-----$/,
    );
    expect(info.algorithm).toMatchObject({ name: 'ECDSA', namedCurve: 'P-256' });
    expect(info.fpr).toMatch(/^sha256:[a-f0-9]{64}$/);
    await ctx.close();
  });

  it('refuses to export the private key (T4.1.2)', async () => {
    const { ctx, page } = await fresh();
    const result = await page.evaluate(async () => {
      window.MRClient.setCsrfToken('s1');
      const pair = await window.MRClient.getClientKey();
      const attempts: Record<string, string> = {};
      for (const format of ['pkcs8', 'raw', 'jwk'] as const) {
        try {
          await crypto.subtle.exportKey(format, pair.privateKey);
          attempts[format] = 'EXPORTED';
        } catch (e) {
          attempts[format] = (e as Error).name;
        }
      }
      return { extractable: pair.privateKey.extractable, attempts };
    });
    expect(result.extractable).toBe(false);
    expect(Object.values(result.attempts).every((v) => v !== 'EXPORTED')).toBe(true);
    await ctx.close();
  });

  it('stays non-extractable after a round trip through IndexedDB', async () => {
    const { ctx, page } = await fresh();
    const out = await page.evaluate(async () => {
      window.MRClient.setCsrfToken('s1');
      await window.MRClient.getClientKey();
      const scope = await window.MRClient.sha256Hex('mra-session-scope:s1');
      const stored = await window.MRClient.loadKey(scope);
      return { present: stored !== null, extractable: stored?.privateKey.extractable };
    });
    expect(out).toEqual({ present: true, extractable: false });
    await ctx.close();
  });

  it('persists across a reload: same session, same public key (T4.1.3)', async () => {
    const { ctx, page } = await fresh();
    const before = await fpr(page, 'session-A');
    await page.reload();
    await page.addScriptTag({ url: lab.origin + '/lib.js' });
    expect(await fpr(page, 'session-A')).toBe(before);
    await ctx.close();
  });

  it('gives a different session a different key and drops the old one (T4.1.7)', async () => {
    const { ctx, page } = await fresh();
    const a = await fpr(page, 'session-A');
    const b = await fpr(page, 'session-B');
    expect(b).not.toBe(a);
    expect(await page.evaluate(() => window.MRClient.countKeys())).toBe(1);
    await ctx.close();
  });

  it('clears the stored key on logout (T4.1.6)', async () => {
    const { ctx, page } = await fresh();
    const first = await fpr(page, 'session-A');
    expect(await page.evaluate(() => window.MRClient.countKeys())).toBe(1);
    await page.evaluate(() => window.MRClient.discardClientKeys());
    expect(await page.evaluate(() => window.MRClient.countKeys())).toBe(0);
    expect(await fpr(page, 'session-A')).not.toBe(first); // a new key, not the discarded one
    await ctx.close();
  });

  it('does not share keys between browser profiles', async () => {
    const one = await fresh();
    const two = await fresh();
    const a = await fpr(one.page, 'same-session-token');
    const b = await fpr(two.page, 'same-session-token');
    expect(a).not.toBe(b);
    await one.ctx.close();
    await two.ctx.close();
  });

  it('signs a payload that verifies against the public key (T4.1.8)', async () => {
    const { ctx, page } = await fresh();
    const ok = await page.evaluate(async () => {
      window.MRClient.setCsrfToken('s1');
      const pair = await window.MRClient.getClientKey();
      const sig = await window.MRClient.signText(pair, 'consent payload');
      const raw = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
        c.charCodeAt(0),
      );
      const alg = { name: 'ECDSA', hash: 'SHA-256' };
      const enc = (s: string) => new TextEncoder().encode(s);
      return {
        good: await crypto.subtle.verify(alg, pair.publicKey, raw, enc('consent payload')),
        bad: await crypto.subtle.verify(alg, pair.publicKey, raw, enc('consent payloaD')),
        length: raw.length,
      };
    });
    expect(ok).toEqual({ good: true, bad: false, length: 64 });
    await ctx.close();
  });

  it('computes the fingerprint as the SHA-256 of the SPKI encoding', async () => {
    const { ctx, page } = await fresh();
    const same = await page.evaluate(async () => {
      window.MRClient.setCsrfToken('s1');
      const pair = await window.MRClient.getClientKey();
      const pem = await window.MRClient.publicKeyPem(pair.publicKey);
      const body = pem.replace(/-----[A-Z ]+-----|\n/g, '');
      const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', der));
      const expected = 'sha256:' + [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
      return expected === (await window.MRClient.fingerprint(pair.publicKey));
    });
    expect(same).toBe(true);
    await ctx.close();
  });
});
