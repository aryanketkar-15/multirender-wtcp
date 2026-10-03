// Informal cross-browser digest comparison (playbook phase 3 go/no-go); seed of the phase 6 stability harness.
// Usage: node research/harness/cross-browser-informal.cjs   (MRA_FIREFOX=path to override the Firefox binary)
// Bundled Chromium, stock Chrome and Edge via Playwright; stock Firefox via WebDriver BiDi.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FIREFOX = process.env.MRA_FIREFOX || 'C:/Program Files/Mozilla Firefox/firefox.exe';
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '../../attestor');
const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
const { buildAttestor } = require(path.join(ROOT, 'scripts/build-lib.cjs'));

const FIXTURES = ['cookie-banner', 'subscription-terms', 'preticked-newsletter', 'reject-as-link', 'terms-with-links',
  'radio-choice', 'switch-preferences', 'privacy-modal', 'loan-terms', 'minimal'];
const VIEWPORTS = [
  { name: '1280x800@1x', width: 1280, height: 800, dpr: 1 },
  { name: '1920x1080@2x', width: 1920, height: 1080, dpr: 2 },
  { name: '800x600@1x', width: 800, height: 600, dpr: 1 },
];
const bundle = buildAttestor({ minify: false }).code;
const SCRIPT = `(async () => { const code = await (await fetch('/attestor.js')).text(); (0, eval)(code + '\\n;globalThis.MRAttestor = MRAttestor;');
  const ev = await MRAttestor.attest({ regionSelector: '#consent-region' });
  const reps = MRAttestor.measure(document, { regionSelector: '#consent-region' });
  return JSON.stringify({ region: ev.critical_region_digest, context: ev.context_digest, env: ev.env, rep: reps.region }); })()`;

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/attestor.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(bundle); }
  const m = /^\/f\/([\w-]+)$/.exec(u);
  if (m) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(fs.readFileSync(path.join(ROOT, 'tests/fixtures', m[1] + '.html'))); }
  res.writeHead(404); res.end();
});

async function playwrightRun(label, launchOpts, base) {
  const out = {};
  const browser = await chromium.launch(launchOpts);
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr });
    for (const f of FIXTURES) {
      const page = await ctx.newPage();
      await page.goto(`${base}/f/${f}`);
      out[`${vp.name}|${f}`] = JSON.parse(await page.evaluate(SCRIPT));
      await page.close();
    }
    await ctx.close();
  }
  const version = browser.version();
  await browser.close();
  return { label: `${label} ${version}`, out };
}

function bidi(ws) {
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.type === 'error' ? p.rej(new Error(m.message)) : p.res(m.result); } };
  return (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => rej(new Error('timeout ' + method)), 30000); });
}

async function firefoxRun(base) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-'));
  const proc = spawn(FIREFOX, ['--headless', '--remote-debugging-port=9333', '--profile', profile, '-no-remote', 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; proc.stderr.on('data', (d) => (log += d)); proc.stdout.on('data', (d) => (log += d));
  for (let i = 0; i < 60 && !/listening on/i.test(log); i++) await new Promise((r) => setTimeout(r, 500));
  const ws = new WebSocket('ws://127.0.0.1:9333/session');
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
  const send = bidi(ws);
  const session = await send('session.new', { capabilities: {} });
  const version = session.capabilities?.browserVersion;
  const tree = await send('browsingContext.getTree', {});
  const context = tree.contexts[0].context;
  const out = {};
  for (const vp of VIEWPORTS) {
    await send('browsingContext.setViewport', { context, viewport: { width: vp.width, height: vp.height }, devicePixelRatio: vp.dpr });
    for (const f of FIXTURES) {
      await send('browsingContext.navigate', { context, url: `${base}/f/${f}`, wait: 'complete' });
      const r = await send('script.evaluate', { expression: SCRIPT, target: { context }, awaitPromise: true, resultOwnership: 'none' });
      if (r.type !== 'success') throw new Error('script failed: ' + JSON.stringify(r.exceptionDetails || r).slice(0, 300));
      out[`${vp.name}|${f}`] = JSON.parse(r.result.value);
    }
  }
  ws.close(); proc.kill();
  return { label: `Firefox ${version}`, out };
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const runs = [];
  runs.push(await playwrightRun('Chromium (bundled)', {}, base));
  for (const [label, channel] of [['Chrome', 'chrome'], ['Edge', 'msedge']]) {
    try { runs.push(await playwrightRun(label, { channel }, base)); } catch (e) { console.log(`${label}: unavailable (${e.message.split('\n')[0]})`); }
  }
  try { runs.push(await firefoxRun(base)); } catch (e) { console.log('Firefox: unavailable (' + e.message + ')'); }
  server.close();

  console.log('\nbrowsers:', runs.map((r) => r.label).join(' | '));
  const ref = runs[0];
  let total = 0, agreeAll = 0; const diffs = [];
  for (const key of Object.keys(ref.out)) {
    total++;
    const sameRegion = runs.every((r) => r.out[key].region === ref.out[key].region);
    const sameContext = runs.every((r) => r.out[key].context === ref.out[key].context);
    if (sameRegion && sameContext) agreeAll++;
    else diffs.push({ key, sameRegion, sameContext });
  }
  console.log(`\nfixture x viewport cells: ${total}; every browser agrees on BOTH digests: ${agreeAll}/${total}`);
  for (const r of runs) {
    const region = Object.keys(ref.out).filter((k) => r.out[k].region === ref.out[k].region).length;
    const context = Object.keys(ref.out).filter((k) => r.out[k].context === ref.out[k].context).length;
    console.log(`  ${r.label.padEnd(34)} region agrees with reference ${region}/${total}, context ${context}/${total}`);
  }
  for (const d of diffs.slice(0, 12)) {
    console.log('\nDISAGREE', d.key, d.sameRegion ? '' : '(region)', d.sameContext ? '' : '(context)');
    const base0 = ref.out[d.key].rep.nodes;
    for (const r of runs.slice(1)) {
      const other = r.out[d.key].rep.nodes;
      for (let i = 0; i < Math.max(base0.length, other.length); i++) {
        if (JSON.stringify(base0[i]) !== JSON.stringify(other[i])) {
          console.log(`  ${r.label} node ${i}:\n    ref  ${JSON.stringify(base0[i])}\n    this ${JSON.stringify(other[i])}`);
          break;
        }
      }
    }
  }
  fs.writeFileSync(path.join(os.tmpdir(), 'xbrowser-result.json'), JSON.stringify(runs.map((r) => ({ label: r.label, cells: Object.fromEntries(Object.entries(r.out).map(([k, v]) => [k, { region: v.region, context: v.context, env: v.env }])) })), null, 2));
})().catch((e) => { console.error('FAILED', e); server.close(); process.exit(1); });
