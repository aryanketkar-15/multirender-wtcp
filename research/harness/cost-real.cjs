/**
 * Milestone 6.3: cost measurement of the REAL system (replaces the earlier simulated harness).
 *
 * Measures, with the real components and nothing stubbed:
 *   1. Digest latency: the built Attestor Module (attestor/dist) running in real Chromium via Playwright.
 *   2. Payload sizes: the real bundle, attestation and evidence pack captured from a live run of
 *      e2e/full-stack.cjs (MRA_COST_DUMP).
 *   3. Verifier throughput: the real verifier (verifier/dist), stages 1-10 and stage 11 (re-render).
 *   4. Merkle proofs: the real PHP MerkleLog, from server/bin/measure_proofs.php (cost-merkle.json).
 *
 * What it does NOT measure: a physical phone. "Mobile" rows are an emulated CPU slowdown on this
 * machine and are labelled as such. cost-mobile-page.html can be opened on a real phone.
 *
 *   node research/harness/cost-real.cjs <dumpDir> [runs]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../..');
const RESULTS = path.join(ROOT, 'research/results');
const req = createRequire(path.join(ROOT, 'verifier/package.json'));
const { chromium } = req('playwright');
const AdmZip = req('adm-zip');
// verifier/dist is ESM with extensionless imports, which plain node cannot load. Bundle the verifier
// source (the code under test, unchanged) into one CommonJS file in a temp directory.
const esbuild = createRequire(path.join(ROOT, 'attestor/package.json'))('esbuild');
const bundled = path.join(ROOT, 'verifier/node_modules/.cache/mra-verifier-cost.cjs'); // git-ignored, resolves playwright
esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'verifier/src/index.ts')],
  outfile: bundled,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['playwright', 'playwright-core'],
  nodePaths: [path.join(ROOT, 'verifier/node_modules')],
  logLevel: 'error',
});
const verifier = createRequire(path.join(ROOT, 'verifier/package.json'))(bundled);

const dumpDir = process.argv[2];
const RUNS = Number(process.argv[3] || 500);
if (!dumpDir || !fs.existsSync(path.join(dumpDir, 'pack.zip'))) {
  console.error('usage: node cost-real.cjs <dumpDir from MRA_COST_DUMP> [runs]');
  process.exit(2);
}
const attestorJs = fs.readFileSync(path.join(ROOT, 'attestor/dist/mra-attestor-1.0.0.js'), 'utf8');
const attestorManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'attestor/dist/manifest.json'), 'utf8'));

function pct(values, p) {
  const v = [...values].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(p * v.length))];
}
const r3 = (x) => Math.round(x * 1000) / 1000;
function dist(values) {
  return {
    runs: values.length,
    min: r3(Math.min(...values)),
    p50: r3(pct(values, 0.5)),
    p95: r3(pct(values, 0.95)),
    p99: r3(pct(values, 0.99)),
    max: r3(Math.max(...values)),
  };
}

/** A consent-like region with about n elements, plus a little page chrome outside it. */
function fixtureHtml(n) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const k = i % 5;
    if (k === 0) parts.push(`<p>Vendor ${i} may process your data for purpose ${i} as set out in its notice.</p>`);
    else if (k === 1) parts.push(`<a href="#v${i}">Privacy notice of vendor ${i}</a>`);
    else if (k === 2) parts.push(`<label><input type="checkbox"> Allow purpose ${i}</label>`);
    else if (k === 3) parts.push(`<h3>Purpose ${i}</h3>`);
    else parts.push(`<button type="button">Details ${i}</button>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px sans-serif}
#consent-region{padding:12px;border:1px solid #888}button{padding:4px 8px}</style></head>
<body><header><h1>Example</h1></header><main><div id="consent-region">${parts.join('')}
<button type="button" id="agree">Accept</button><button type="button">Reject</button></div></main></body></html>`;
}

async function digestLatency(browser, targetNodes, throttle) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.route('http://localhost/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtml(targetNodes) }),
  );
  await page.goto('http://localhost/', { waitUntil: 'load' });
  await page.addScriptTag({ content: attestorJs });
  if (throttle > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  }
  const out = await page.evaluate(
    async ({ runs, warm }) => {
      const A = window.MRAttestor;
      const total = [];
      const measureOnly = [];
      let nodes = null;
      for (let i = 0; i < runs + warm; i++) {
        const t0 = performance.now();
        const ev = await A.attest({ regionSelector: '#consent-region' });
        const t1 = performance.now();
        if (i >= warm) total.push(t1 - t0);
        nodes = { region: ev.region_nodes, context: ev.context_nodes };
        const m0 = performance.now();
        A.measure(document, { regionSelector: '#consent-region' });
        const m1 = performance.now();
        if (i >= warm) measureOnly.push(m1 - m0);
      }
      return { total, measureOnly, nodes };
    },
    { runs: RUNS, warm: 20 },
  );
  await context.close();
  return { nodes_measured: out.nodes, attest_ms: dist(out.total), measure_only_ms: dist(out.measureOnly) };
}

function payloadSizes() {
  const bundleRaw = fs.readFileSync(path.join(dumpDir, 'bundle-response.json'), 'utf8');
  const bundleDoc = JSON.parse(bundleRaw);
  const attReqRaw = fs.readFileSync(path.join(dumpDir, 'attestation-request.json'), 'utf8');
  const zip = fs.readFileSync(path.join(dumpDir, 'pack.zip'));
  const entries = new AdmZip(zip).getEntries().map((e) => ({
    file: e.entryName,
    bytes: e.header.size,
    compressed_bytes: e.header.compressedSize,
  }));
  const bundleOnly = Buffer.byteLength(JSON.stringify(bundleDoc.bundle ?? {}));
  return {
    sealed_bundle_bytes: bundleOnly,
    bundle_response_bytes: Buffer.byteLength(bundleRaw),
    attestation_request_bytes: Buffer.byteLength(attReqRaw),
    evidence_pack_zip_bytes: zip.length,
    evidence_pack_entries: entries,
    evidence_pack_uncompressed_bytes: entries.reduce((s, e) => s + e.bytes, 0),
  };
}

async function verifierThroughput(browser, n) {
  const zip = fs.readFileSync(path.join(dumpDir, 'pack.zip'));
  const keys = JSON.parse(fs.readFileSync(path.join(dumpDir, 'mra-key.json'), 'utf8'));
  const attHash = attestorManifest.sha256 ?? attestorManifest.attestor_hash ?? attestorManifest.hash;
  const options = {
    serverPublicKeyHex: keys.keys[0].public_key,
    recognizedAttestors: [String(attHash).startsWith('sha256:') ? attHash : `sha256:${attHash}`],
  };
  const first = verifier.verifyPackStages1To10(zip, options);
  const result = {
    first_result: { ok: first.ok, verdict: String(first.verdict), message: first.message },
    attestor_hash_used: options.recognizedAttestors[0],
  };
  const lat = [];
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) {
    const s = process.hrtime.bigint();
    verifier.verifyPackStages1To10(zip, options);
    lat.push(Number(process.hrtime.bigint() - s) / 1e6);
  }
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;
  result.stages_1_to_10 = { packs: n, packs_per_minute: Math.round((n / secs) * 60), latency_ms: dist(lat) };

  // Stage 11: re-render in one warm browser, packs one after another (a single verifier instance).
  const unpacked = verifier.unpackPack(zip);
  const renderN = 50;
  const rl = [];
  let verdict = null;
  const r0 = process.hrtime.bigint();
  for (let i = 0; i < renderN; i++) {
    const s = process.hrtime.bigint();
    const res = await verifier.renderAndVerify(unpacked, { browser });
    rl.push(Number(process.hrtime.bigint() - s) / 1e6);
    verdict = { ok: res.ok, verdict: String(res.verdict), message: res.message };
  }
  const rsecs = Number(process.hrtime.bigint() - r0) / 1e9;
  result.stage_11_rerender_warm_browser = {
    packs: renderN,
    packs_per_minute: Math.round((renderN / rsecs) * 60),
    latency_ms: dist(rl),
    last_verdict: verdict,
  };
  return result;
}

(async () => {
  const browser = await chromium.launch();
  const env = {
    measured_at: new Date().toISOString(),
    cpu: os.cpus()[0].model.trim(),
    logical_cores: os.cpus().length,
    memory_gb: Math.round(os.totalmem() / 2 ** 30),
    os: `${os.type()} ${os.release()}`,
    node: process.version,
    chromium: browser.version(),
    attestor_version: attestorManifest.version,
    runs_per_cell: RUNS,
    note: 'Single development machine. No physical phone was used.',
  };
  console.log('digest latency...');
  const digest = {};
  for (const [label, nodes] of [['small', 20], ['standard', 50], ['large', 500]]) {
    digest[label] = {
      this_machine: await digestLatency(browser, nodes, 1),
      emulated_4x_cpu_slowdown: await digestLatency(browser, nodes, 4),
    };
    console.log(' ', label, digest[label].this_machine.attest_ms.p95, 'ms p95 /', digest[label].emulated_4x_cpu_slowdown.attest_ms.p95, 'ms emulated');
  }
  console.log('payload sizes...');
  const payloads = payloadSizes();
  console.log('verifier throughput...');
  const throughput = await verifierThroughput(browser, 1000);
  await browser.close();
  const merklePath = path.join(RESULTS, 'cost-merkle.json');
  const merkle = fs.existsSync(merklePath) ? JSON.parse(fs.readFileSync(merklePath, 'utf8')) : null;
  const out = { env, digest_latency: digest, payload_sizes: payloads, verifier_throughput: throughput, merkle_proofs: merkle };
  fs.writeFileSync(path.join(RESULTS, 'cost-real.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('wrote research/results/cost-real.json');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
