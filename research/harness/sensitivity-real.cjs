/**
 * Milestone 6.2 (redone): sensitivity of the render digests to twenty adversarial mutations,
 * measured by applying each mutation to the real DOM of each corpus page in real Chromium and
 * comparing real digests from the real Attestor Module.
 *
 *   node research/harness/sensitivity-real.cjs [browser]      (default: chromium, 1280x800, DPR 1)
 *
 * Results: research/results/sensitivity-real.json and sensitivity-table.md.
 */
const fs = require('fs');
const path = require('path');
const { openBrowser, ROOT, pages } = require('./lib/browsers.cjs');
const { diffCause } = require('./lib/diff.cjs');
const { mutations } = require('../mutations/mutations.cjs');

const RESULTS = path.join(ROOT, 'research/results');

(async () => {
  const name = process.argv[2] || 'chromium';
  const b = await openBrowser(name);
  await b.setEnv(1280, 800, 1);

  const base = new Map();
  for (const s of pages.specs) base.set(s.id, await b.measure(s.id, { full: true }));
  console.log('baselines done');

  const out = [];
  for (const m of mutations) {
    const row = { id: m.id, name: m.name, taxonomy: m.taxonomy, category: m.category, target: m.target, description: m.description, pages: pages.specs.length, applicable: 0, not_applicable: 0, detected_region: 0, detected_context_only: 0, undetected: 0, causes: {}, undetected_ids: [], undetected_examples: [], failures: 0 };
    for (const s of pages.specs) {
      let r;
      try {
        r = await b.measure(s.id, { full: true, mutation: m.source });
      } catch (e) {
        row.failures++;
        continue;
      }
      if (!r.applied) {
        row.not_applicable++;
        continue;
      }
      row.applicable++;
      const a = base.get(s.id);
      if (r.region !== a.region) {
        row.detected_region++;
        const c = diffCause(a.rs, r.rs).primary;
        row.causes[c] = (row.causes[c] || 0) + 1;
      } else if (r.context !== a.context) {
        row.detected_context_only++;
        const c = 'context:' + diffCause(a.cs, r.cs).primary;
        row.causes[c] = (row.causes[c] || 0) + 1;
      } else {
        row.undetected++;
        row.undetected_ids.push(s.id);
        if (row.undetected_examples.length < 2) row.undetected_examples.push({ id: s.id, region_nodes: a.rn, same_signatures: JSON.stringify(a.rs) === JSON.stringify(r.rs) });
      }
    }
    // Determinism: the same mutation on the first 20 pages, measured twice, must give identical digests.
    let det = 0;
    let detN = 0;
    for (const s of pages.specs.slice(0, 20)) {
      const x = await b.measure(s.id, { mutation: m.source });
      const y = await b.measure(s.id, { mutation: m.source });
      detN++;
      if (x.region === y.region && x.context === y.context) det++;
    }
    row.determinism = { pages: detN, identical: det };
    row.detection_rate_any = row.applicable ? (row.detected_region + row.detected_context_only) / row.applicable : null;
    row.detection_rate_region = row.applicable ? row.detected_region / row.applicable : null;
    out.push(row);
    console.log(m.id, m.name.padEnd(34), `applicable ${String(row.applicable).padStart(3)}  region ${String(row.detected_region).padStart(3)}  context-only ${String(row.detected_context_only).padStart(3)}  undetected ${String(row.undetected).padStart(3)}`);
  }
  const result = { generated_at: new Date().toISOString(), browser: b.label, viewport: '1280x800 @1x, default fonts', corpus: 'synthetic, 200 pages (research/corpus/pages.cjs)', mutations: out };
  fs.writeFileSync(path.join(RESULTS, 'sensitivity-real.json'), JSON.stringify(result, null, 1) + '\n');
  await b.close();

  const pct = (x) => (x == null ? 'n/a' : (100 * x).toFixed(1) + '%');
  const L = ['# Sensitivity to adversarial mutations (milestone 6.2, real rendering)', '', `Generated ${result.generated_at}. ${result.browser}, ${result.viewport}. Corpus: ${result.corpus}. A mutation is applied to the real DOM after load; "detected" means a real digest changed. Mutations a page has nothing to change are counted as not applicable, never as misses.`, '', '| ID | Mutation | Source | Applicable | Detected (region) | Detected (context only) | Undetected | Rate (region) | Rate (any digest) | Determinism (20 pages) | Caught by |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of out) L.push(`| ${r.id} | ${r.name} | ${r.taxonomy} | ${r.applicable} | ${r.detected_region} | ${r.detected_context_only} | ${r.undetected} | ${pct(r.detection_rate_region)} | ${pct(r.detection_rate_any)} | ${r.determinism.identical}/${r.determinism.pages} | ${Object.entries(r.causes).map(([k, v]) => `${k} ${v}`).join(', ') || '-'} |`);
  fs.writeFileSync(path.join(RESULTS, 'sensitivity-table.md'), L.join('\n') + '\n');
  console.log('wrote sensitivity-real.json, sensitivity-table.md');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
