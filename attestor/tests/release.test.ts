import { existsSync, mkdtempSync, readFileSync } from 'fs';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { createServer as createHttp } from 'http';
import type { Server } from 'http';
import { Lab, describeBrowser } from './browser/harness';

/* eslint-disable @typescript-eslint/no-require-imports */
const { build, manifestFor } = require('../scripts/build.cjs') as {
  build: (dir: string) => { file: string; sha384: string; sha256: string; version: string };
  manifestFor: (code: string, version: string) => { sha384: string; sha256: string };
};
const { createServer } = require('../scripts/serve.cjs') as {
  createServer: (dir: string, overrides?: Record<string, (b: Buffer) => Buffer>) => Server;
};
/* eslint-enable @typescript-eslint/no-require-imports */

const read = (dir: string, file: string) => readFileSync(join(dir, file));

describe('reproducible build (T3.5.1)', () => {
  const a = mkdtempSync(join(tmpdir(), 'mra-a-'));
  const b = mkdtempSync(join(tmpdir(), 'mra-b-'));
  const ma = build(a);
  const mb = build(b);

  it('produces identical bytes and identical hashes on repeated builds', () => {
    expect(read(a, ma.file).equals(read(b, mb.file))).toBe(true);
    expect(ma.sha384).toBe(mb.sha384);
    expect(ma.sha256).toBe(mb.sha256);
  });

  it('embeds no timestamp and no absolute path of the build machine', () => {
    const text = read(a, ma.file).toString('utf8');
    expect(text).not.toContain(resolve(__dirname, '..'));
    expect(text).not.toMatch(/[A-Z]:\\Users/);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it('is pure ASCII, so line endings and encodings cannot change the hash', () => {
    expect([...read(a, ma.file)].every((byte) => byte < 0x80)).toBe(true);
    expect(read(a, ma.file).includes('\r')).toBe(false);
  });

  it('emits an SRI value and an attestor hash that anyone can recompute from the file', () => {
    expect(ma.sha384).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
    expect(ma.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    const recomputed = manifestFor(read(a, ma.file).toString('utf8'), ma.version);
    expect(recomputed.sha384).toBe(ma.sha384);
    expect(recomputed.sha256).toBe(ma.sha256);
  });

  const committed = join(__dirname, '../dist/manifest.json');
  (existsSync(committed) ? it : it.skip)('matches the committed release artefact', () => {
    const manifest = JSON.parse(readFileSync(committed, 'utf8'));
    expect(ma.sha256).toBe(manifest.sha256);
    expect(ma.sha384).toBe(manifest.sha384);
  });
});

describeBrowser('separate origin, SRI and fail-closed loading', () => {
  const lab = new Lab();
  const dir = mkdtempSync(join(tmpdir(), 'mra-host-'));
  const manifest = build(dir);
  let app: Server;
  let appUrl = '';
  let good: Server;
  let tampered: Server;
  let goodUrl = '';
  let tamperedUrl = '';

  const listen = (s: Server) =>
    new Promise<string>((ok) =>
      s.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)),
    );

  beforeAll(async () => {
    await lab.start();
    good = createServer(dir);
    // The host alters one byte of the module: a compromised or substituted host.
    tampered = createServer(dir, {
      [manifest.file]: (body) => Buffer.from(body.toString('utf8').replace('sha256:', 'sha25x:')),
    });
    // The consent page itself, on yet another origin: the attestor host is never the page's origin.
    app = createHttp((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><body><div id="consent-region"><p>Hi</p></div></body>');
    });
    appUrl = await listen(app);
    goodUrl = await listen(good);
    tamperedUrl = await listen(tampered);
  });

  afterAll(async () => {
    await lab.stop();
    good.close();
    tampered.close();
    app.close();
  });

  /** Loads the module the way the consent page does: a script tag with integrity, cross-origin. */
  async function load(base: string, integrity = manifest.sha384) {
    const { context, close } = await openBlank();
    try {
      const page = await context.newPage();
      await page.goto(appUrl);
      return await page.evaluate(
        ([src, sri]) =>
          new Promise<{ outcome: string; origin: string; scriptOrigin: string; digest?: string }>(
            (resolveLoad) => {
              const s = document.createElement('script');
              s.src = src;
              s.integrity = sri;
              s.crossOrigin = 'anonymous';
              const info = (outcome: string) => ({
                outcome,
                origin: location.origin,
                scriptOrigin: new URL(src).origin,
              });
              s.onload = async () => {
                const ev = await window.MRAttestor.attest({ regionSelector: '#consent-region' });
                resolveLoad({ ...info('loaded'), digest: ev.critical_region_digest });
              };
              s.onerror = () =>
                resolveLoad({ ...info(window.MRAttestor ? 'ran-anyway' : 'refused') });
              document.head.appendChild(s);
            },
          ),
        [`${base}/${manifest.file}`, integrity] as const,
      );
    } finally {
      await close();
    }
  }

  async function openBlank() {
    const context = await lab.context();
    return { context, close: () => context.close() };
  }

  it('loads and runs the genuine module, producing a digest (T3.5.3)', async () => {
    const r = await load(goodUrl);
    expect(r.outcome).toBe('loaded');
    expect(r.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('serves the module from a different origin than the page (T3.5.4)', async () => {
    const r = await load(goodUrl);
    expect(r.scriptOrigin).not.toBe(r.origin);
  });

  it('refuses a module altered by one byte: SRI blocks execution (T3.5.2)', async () => {
    const r = await load(tamperedUrl);
    expect(r.outcome).toBe('refused');
  });

  it('refuses a genuine module when the pinned integrity is wrong', async () => {
    const r = await load(goodUrl, 'sha384-' + 'A'.repeat(64));
    expect(r.outcome).toBe('refused');
  });

  it('fails when the host is unreachable (T3.5.8, browser half)', async () => {
    const r = await load('http://127.0.0.1:9');
    expect(r.outcome).toBe('refused');
  });
});
