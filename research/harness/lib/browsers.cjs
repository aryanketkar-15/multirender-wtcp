/**
 * Real-browser driver shared by the stability and sensitivity harnesses (milestones 6.1, 6.2).
 * Serves the synthetic corpus and the built Attestor Module over a local http server and measures
 * each page with the real Attestor in a real browser:
 *   chromium (Playwright's bundled), chrome and msedge (installed, via Playwright channels),
 *   firefox (the installed Firefox, driven over WebDriver BiDi).
 * WebKit/Safari is not available on this machine and is not measured.
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../../..');
const { chromium } = createRequire(path.join(ROOT, 'verifier/package.json'))('playwright');
const pages = require(path.join(ROOT, 'research/corpus/pages.cjs'));
const FIREFOX = process.env.MRA_FIREFOX || 'C:/Program Files/Mozilla Firefox/firefox.exe';
const ATTESTOR = fs.readFileSync(path.join(ROOT, 'attestor/dist/mra-attestor-1.0.0.js'), 'utf8');

/** Fonts: "default" is the page's own stack; "fallback" forces a family that is not installed. */
const FALLBACK_CSS = '*{font-family:"MRA Missing Font",serif !important}';

const MEASURE = (font, full, mutation) => `(async () => {
  if (typeof MRAttestor === 'undefined') { (0, eval)(${JSON.stringify(ATTESTOR)} + String.fromCharCode(10) + ';globalThis.MRAttestor = MRAttestor;'); }
  ${mutation ? `window.__applied = (${mutation})();` : ''}
  const inject = () => { const st = document.createElement('style'); st.textContent = ${JSON.stringify(FALLBACK_CSS)}; document.head.appendChild(st); };
  const fnv = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
  const sigs = (nodes) => nodes.map((n) => { const st = n.style || {}; const known = ['i','role','visible','occlusion','text','name','level','style']; const rest = {}; for (const k of Object.keys(n).sort()) if (!known.includes(k)) rest[k] = n[k]; return [n.role, n.visible ? 1 : 0, n.occlusion, fnv(String(n.text ?? n.name ?? '')), n.level ?? '', st.size ?? '', st.weight ?? '', st.contrast ?? '', st.prominence ?? '', JSON.stringify(rest)].join('|'); });
  const run = async () => {
    const ev = await MRAttestor.attest({ regionSelector: '#consent-region' });
    const out = { region: ev.critical_region_digest, context: ev.context_digest, rn: ev.region_nodes, cn: ev.context_nodes, applied: window.__applied ?? null, env: ev.env };
    ${full ? `const reps = MRAttestor.measure(document, { regionSelector: '#consent-region' }); out.rs = sigs(reps.region.nodes); out.cs = sigs(reps.context.nodes);` : ''}
    return out;
  };
  ${font === 'both' ? "const d = await run(); inject(); const f = await run(); return JSON.stringify({ default: d, fallback: f });" : font === 'fallback' ? "inject(); return JSON.stringify(await run());" : "return JSON.stringify(await run());"}
})()`;

function startServer() {
  const server = http.createServer((req, res) => {
    const m = /^\/p\/(corpus-\d{3})$/.exec(req.url.split('?')[0]);
    if (m) {
      const spec = pages.specs[Number(m[1].slice(7)) - 1];
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(pages.buildPage(spec));
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

function bidi(ws) {
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      m.type === 'error' ? p.rej(new Error(m.message)) : p.res(m.result);
    }
  };
  return (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
      setTimeout(() => rej(new Error('timeout ' + method)), 20000);
    });
}

/** Opens one browser. Returns { label, version, setEnv(w,h,dpr), measure(id,{font,full,mutation}), close() }. */
async function openBrowser(name) {
  const { server, base } = await startServer();
  if (name === 'firefox') {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-'));
    const port = 9300 + Math.floor(Math.random() * 500);
    const proc = spawn(FIREFOX, ['--headless', `--remote-debugging-port=${port}`, '--profile', profile, '-no-remote', 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    proc.stderr.on('data', (d) => (log += d));
    proc.stdout.on('data', (d) => (log += d));
    for (let i = 0; i < 80 && !/listening on/i.test(log); i++) await new Promise((r) => setTimeout(r, 500));
    const ws = new WebSocket(`ws://127.0.0.1:${port}/session`);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = () => rej(new Error('firefox websocket'));
    });
    const send = bidi(ws);
    const session = await send('session.new', { capabilities: {} });
    const tree = await send('browsingContext.getTree', {});
    const context = tree.contexts[0].context;
    return {
      label: 'Firefox ' + session.capabilities?.browserVersion,
      version: session.capabilities?.browserVersion,
      async setEnv(w, h, dpr) {
        await send('browsingContext.setViewport', { context, viewport: { width: w, height: h }, devicePixelRatio: dpr });
      },
      async measure(id, opts = {}) {
        await send('browsingContext.navigate', { context, url: `${base}/p/${id}`, wait: 'complete' });
        const r = await send('script.evaluate', { expression: MEASURE(opts.font, opts.full, opts.mutation), target: { context }, awaitPromise: true, resultOwnership: 'none' });
        if (r.type !== 'success') throw new Error('script failed: ' + JSON.stringify(r.exceptionDetails || r).slice(0, 300));
        return JSON.parse(r.result.value);
      },
      async close() {
        ws.close();
        proc.kill();
        server.close();
      },
    };
  }
  const launch = name === 'chromium' ? {} : { channel: name };
  const browser = await chromium.launch(launch);
  let ctx = null;
  let page = null;
  return {
    label: `${name} ${browser.version()}`,
    version: browser.version(),
    async setEnv(w, h, dpr) {
      if (ctx) await ctx.close();
      ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
      page = await ctx.newPage();
    },
    async measure(id, opts = {}) {
      await page.goto(`${base}/p/${id}`, { waitUntil: 'load' });
      return JSON.parse(await page.evaluate(MEASURE(opts.font, opts.full, opts.mutation)));
    },
    async close() {
      await browser.close();
      server.close();
    },
  };
}

module.exports = { openBrowser, ROOT, pages };
