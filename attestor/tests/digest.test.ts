import { Lab, describeBrowser, fixture } from './browser/harness';
import type { ViewportOptions } from './browser/harness';
import type { Page } from 'playwright';

const SEL = '#consent-region';

interface Ev {
  critical_region_digest: string;
  context_digest: string;
  env: { engine: string; viewport_bucket: string; dpr_bucket: string };
  region_nodes: number;
  context_nodes: number;
}

describeBrowser('dual digest in a Web Worker', () => {
  const lab = new Lab();
  beforeAll(() => lab.start());
  afterAll(() => lab.stop());

  const subscription = fixture('subscription-terms.html');

  async function withPage<T>(
    html: string,
    vp: ViewportOptions,
    fn: (p: Page) => Promise<T>,
  ): Promise<T> {
    const { page, close } = await lab.open(html, vp);
    try {
      return await fn(page);
    } finally {
      await close();
    }
  }

  const evidence = (page: Page): Promise<Ev> =>
    page.evaluate((sel) => window.MRAttestor.attest({ regionSelector: sel }) as Promise<Ev>, SEL);

  /** Digest of the fixture after running a DOM mutation script in the page. */
  const after = (script: string, vp: ViewportOptions = {}) =>
    withPage(subscription, vp, async (page) => {
      await page.evaluate(script);
      return evidence(page);
    });

  it('is deterministic: 1000 runs give one value per digest (T3.4.1)', async () => {
    await withPage(subscription, {}, async (page) => {
      const seen = await page.evaluate(async (sel) => {
        const region = new Set<string>();
        const context = new Set<string>();
        for (let i = 0; i < 1000; i++) {
          const e = await window.MRAttestor.attest({ regionSelector: sel });
          region.add(e.critical_region_digest);
          context.add(e.context_digest);
        }
        return { region: [...region], context: [...context] };
      }, SEL);
      expect(seen.region).toHaveLength(1);
      expect(seen.context).toHaveLength(1);
      expect(seen.region[0]).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  }, 120_000);

  it('detects a one-word text change (T3.4.3)', async () => {
    const a = await after('0');
    const b = await after(
      "document.querySelector('p').textContent = 'Automatic renewal will be applied.'",
    );
    expect(b.critical_region_digest).not.toBe(a.critical_region_digest);
  });

  it('detects a pre-ticked checkbox (T3.4.4)', async () => {
    const a = await after('0');
    const b = await after("document.querySelector('#agree').checked = true");
    expect(b.critical_region_digest).not.toBe(a.critical_region_digest);
  });

  it('is unchanged by viewport width when semantics are the same (T3.4.5)', async () => {
    const wide = await after('0', { width: 1920, height: 1080 });
    const narrow = await after('0', { width: 1280, height: 720 });
    expect(narrow.critical_region_digest).toBe(wide.critical_region_digest);
    expect(narrow.context_digest).toBe(wide.context_digest);
  });

  it('is unchanged by device pixel ratio (T3.4.6)', async () => {
    const one = await after('0', { deviceScaleFactor: 1 });
    const two = await after('0', { deviceScaleFactor: 2 });
    const three = await after('0', { deviceScaleFactor: 3 });
    expect(two.critical_region_digest).toBe(one.critical_region_digest);
    expect(three.critical_region_digest).toBe(one.critical_region_digest);
    expect(two.context_digest).toBe(one.context_digest);
  });

  it('records the environment but never digests it (T3.4.9)', async () => {
    const big = await after('0', { width: 1920, height: 1080, deviceScaleFactor: 1 });
    const small = await after('0', { width: 520, height: 900, deviceScaleFactor: 2 });
    expect(small.env.viewport_bucket).toBe('small');
    expect(big.env.viewport_bucket).toBe('large');
    expect(small.env.dpr_bucket).toBe('2x');
    expect(big.env.dpr_bucket).toBe('1x');
    expect(small.env.engine).toBe('Blink');
    expect(small.critical_region_digest).toBe(big.critical_region_digest);
    expect(small.context_digest).toBe(big.context_digest);
  });

  it('lets the context digest catch an overlay the region digest cannot see (T3.4.7)', async () => {
    const clean = await after('0');
    const attacked = await after(`
      const o = document.createElement('div');
      o.style.cssText = 'position:fixed;bottom:0;left:0;right:0;padding:12px;background:#fee';
      o.textContent = 'Limited offer: click anywhere to win a prize';
      document.body.appendChild(o);
    `);
    expect(attacked.critical_region_digest).toBe(clean.critical_region_digest);
    expect(attacked.context_digest).not.toBe(clean.context_digest);
  });

  it('sees an overlay covering the region as a change of the region digest', async () => {
    const clean = await after('0');
    const attacked = await after(`
      const r = document.querySelector('#consent-region');
      r.style.position = 'relative';
      const c = document.createElement('div');
      c.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0.99';
      r.appendChild(c);
    `);
    expect(attacked.critical_region_digest).not.toBe(clean.critical_region_digest);
  });

  it('keeps hashing off the main thread (T3.4.8)', async () => {
    await withPage(subscription, {}, async (page) => {
      const result = await page.evaluate(async () => {
        const worker = new window.MRAttestor.DigestWorker();
        await worker.ping();
        const nodes = Array.from({ length: 20000 }, (_, i) => ({ i, text: 'node ' + i }));
        const pending = worker.digest({ v: 'srd/1.0', policy: 'x', nodes });
        const until = performance.now() + 400; // keep the main thread busy for 400 ms
        while (performance.now() < until) {
          /* spin */
        }
        const mainResumedAt = Date.now();
        const reply = await pending;
        worker.terminate();
        return { workerFinishedAt: reply.completedAt, mainResumedAt };
      });
      // The worker completed while the main thread was still blocked.
      expect(result.workerFinishedAt).toBeLessThanOrEqual(result.mainResumedAt);
    });
  });

  it('measures a 500-node region and records the timing (T3.4.10)', async () => {
    const rows = Array.from(
      { length: 250 },
      (_, i) =>
        `<p>Clause ${i}: the customer agrees to term number ${i}.</p><label><input type="checkbox"> Item ${i}</label>`,
    ).join('');
    const html = `<!doctype html><body style="font:16px sans-serif"><div id="consent-region">${rows}<button>Accept</button></div></body>`;
    await withPage(html, {}, async (page) => {
      const t = await page.evaluate(async (sel) => {
        const start = performance.now();
        const e = await window.MRAttestor.attest({ regionSelector: sel });
        return { ms: performance.now() - start, nodes: e.region_nodes };
      }, SEL);
      expect(t.nodes).toBeGreaterThanOrEqual(500);
      console.info(
        `[phase 6 input] attest() on ${t.nodes} nodes: ${t.ms.toFixed(1)} ms (headless Chromium)`,
      );
      expect(t.ms).toBeLessThan(5000);
    });
  });

  it('documents a property: zero-width injection leaves the semantic digest unchanged', async () => {
    // It does change the bundle hash (the raw markup differs), so it is caught there, not here.
    const a = await after('0');
    const b = await after(
      "document.querySelector('#btn-reject').textContent = 'Re' + String.fromCharCode(0x200b) + 'ject'",
    );
    expect(b.critical_region_digest).toBe(a.critical_region_digest);
  });

  it('reports missing regions clearly', async () => {
    await withPage('<body><p>x</p></body>', {}, async (page) => {
      const message = await page.evaluate(async () => {
        try {
          await window.MRAttestor.attest({ regionSelector: '#nope' });
          return 'no error';
        } catch (e) {
          return (e as Error).message;
        }
      });
      expect(message).toContain('critical region not found');
    });
  });
});
