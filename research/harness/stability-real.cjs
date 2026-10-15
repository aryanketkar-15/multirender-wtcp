/**
 * Milestone 6.1 (redone): cross-environment stability of the render digest, measured by really
 * rendering the corpus and running the real Attestor Module in real browsers.
 *
 *   node research/harness/stability-real.cjs run <chromium|chrome|msedge|firefox> [rerun]
 *   node research/harness/stability-real.cjs analyse
 *
 * Matrix per browser: 200 pages x 5 viewports x 3 device pixel ratios x 2 font conditions = 6000
 * cells (24,000 across four browsers). Safari/WebKit is not available here and is NOT measured.
 */
const fs = require('fs');
const path = require('path');
const { openBrowser, ROOT, pages } = require('./lib/browsers.cjs');

const RESULTS = path.join(ROOT, 'research/results');
const RAW = path.join(RESULTS, 'raw');
const VIEWPORTS = [
  { name: '375x667', width: 375, height: 667 },
  { name: '414x896', width: 414, height: 896 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1920x1080', width: 1920, height: 1080 },
];
const DPRS = [1, 2, 3];
const FONTS = ['default', 'fallback'];
const BROWSERS = ['chromium', 'chrome', 'msedge', 'firefox'];
const REF_VP = '1280x800';

async function run(name, rerun) {
  fs.mkdirSync(RAW, { recursive: true });
  const file = path.join(RAW, `stability-${name}${rerun ? '-rerun' : ''}.jsonl`);
  const only = process.env.MRA_VP; // resume support: measure just one viewport, appending to the file
  if (!only) fs.writeFileSync(file, '');
  let b = await openBrowser(name);
  fs.appendFileSync(file, JSON.stringify({ meta: { browser: name, label: b.label, version: b.version, started: new Date().toISOString() } }) + '\n');
  let n = 0;
  const t0 = Date.now();
  for (const vp of VIEWPORTS.filter((v) => !only || v.name === only)) {
    // A fresh browser per viewport: Firefox stalled after about 2000 navigations in one session.
    if (false) {
      await b.close();
      b = await openBrowser(name);
    }
    for (const dpr of DPRS) {
      await b.setEnv(vp.width, vp.height, dpr);
      const lines = [];
      for (const spec of pages.specs) {
        let res = null;
        let err = null;
        for (let attempt = 0; attempt < 2 && !res; attempt++) {
          try {
            res = await b.measure(spec.id, { font: 'both', full: true });
          } catch (e) {
            err = String(e.message || e).split('\n')[0].slice(0, 160);
          }
        }
        for (const font of FONTS) {
          const cell = res ? res[font] : null;
          lines.push(JSON.stringify(cell ? { id: spec.id, vp: vp.name, dpr, font, region: cell.region, context: cell.context, rn: cell.rn, cn: cell.cn, rs: cell.rs, cs: cell.cs } : { id: spec.id, vp: vp.name, dpr, font, err }));
          n++;
        }
      }
      fs.appendFileSync(file, lines.join('\n') + '\n');
      console.log(`${name} ${vp.name}@${dpr}x done, ${n} cells, ${Math.round((Date.now() - t0) / 1000)}s`);
    }
  }
  await b.close();
  console.log(`${name}: ${n} cells -> ${path.relative(ROOT, file)}`);
}

function load(name, rerun) {
  const file = path.join(RAW, `stability-${name}${rerun ? '-rerun' : ''}.jsonl`);
  const cells = new Map();
  let meta = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    const o = JSON.parse(line);
    if (o.meta) meta = o.meta;
    else cells.set(`${o.id}|${o.vp}|${o.dpr}|${o.font}`, o);
  }
  return { meta, cells };
}

const { diffCause } = require('./lib/diff.cjs');

function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

function newAxis() {
  return { comparisons: 0, region_agree: 0, context_agree: 0, failures: 0, causes: {}, by_group: {}, examples: {} };
}
function record(axis, group, a, b, extra) {
  axis.comparisons++;
  const g = (axis.by_group[group] ||= { comparisons: 0, region_agree: 0, context_agree: 0 });
  g.comparisons++;
  if (!a || !b || a.err || b.err) {
    axis.failures++;
    return;
  }
  const regionSame = a.region === b.region;
  const contextSame = a.context === b.context;
  if (regionSame) (axis.region_agree++, g.region_agree++);
  if (contextSame) (axis.context_agree++, g.context_agree++);
  if (!regionSame || !contextSame) {
    const which = regionSame ? 'context_only' : 'region';
    const dc = regionSame ? diffCause(a.cs, b.cs) : diffCause(a.rs, b.rs);
    const key = `${which}:${dc.primary}`;
    axis.causes[key] = (axis.causes[key] || 0) + 1;
    if (extra) axis.causes[`${key}${extra}`] = (axis.causes[`${key}${extra}`] || 0) + 1;
    const ex = (axis.examples[key] ||= []);
    if (ex.length < 3) ex.push({ id: a.id, vp: a.vp, dpr: a.dpr, font: a.font, detail: dc.detail });
  }
}

function analyse() {
  const data = {};
  for (const n of BROWSERS) data[n] = load(n);
  const ref = data.chromium.cells;
  const axes = { browser: newAxis(), dpr: newAxis(), font: newAxis(), viewport: newAxis() };
  const perInterface = {};
  const archetype = {};
  const spec = (id) => pages.specs[Number(id.slice(7)) - 1];

  for (const s of pages.specs) {
    for (const vp of VIEWPORTS) {
      for (const dpr of DPRS) {
        for (const font of FONTS) {
          const k = `${s.id}|${vp.name}|${dpr}|${font}`;
          // browser axis: each browser against bundled Chromium at the same viewport, DPR and font
          for (const bn of BROWSERS.slice(1)) record(axes.browser, bn, ref.get(k), data[bn].cells.get(k));
        }
      }
    }
    for (const bn of BROWSERS) {
      const c = data[bn].cells;
      for (const vp of VIEWPORTS) {
        for (const font of FONTS) {
          // DPR axis: 2x and 3x against 1x
          for (const dpr of [2, 3]) record(axes.dpr, `${bn} ${dpr}x`, c.get(`${s.id}|${vp.name}|1|${font}`), c.get(`${s.id}|${vp.name}|${dpr}|${font}`));
        }
        // font axis: fallback against default
        for (const dpr of DPRS) record(axes.font, bn, c.get(`${s.id}|${vp.name}|${dpr}|default`), c.get(`${s.id}|${vp.name}|${dpr}|fallback`));
      }
      // viewport axis (third axis): every other viewport against 1280x800, same browser, DPR 1, default font
      for (const vp of VIEWPORTS.filter((v) => v.name !== REF_VP)) {
        const active = s.breakpoint > 0 && vp.width <= s.breakpoint;
        record(axes.viewport, `${vp.name}`, c.get(`${s.id}|${REF_VP}|1|default`), c.get(`${s.id}|${vp.name}|1|default`), active ? ':media_query_active' : ':no_media_query_change');
      }
    }
  }

  // Per-archetype and per-interface summary of region disagreements on the environment axes
  for (const bn of BROWSERS.slice(1)) {
    for (const [k, cell] of data[bn].cells) {
      const r = ref.get(k);
      if (!r || !cell || r.err || cell.err) continue;
      const s = spec(cell.id);
      const a = (archetype[s.archetype] ||= { comparisons: 0, disagree: 0 });
      a.comparisons++;
      if (r.region !== cell.region) {
        a.disagree++;
        perInterface[cell.id] = (perInterface[cell.id] || 0) + 1;
      }
    }
  }

  // Reproducibility: re-run of the whole Chromium matrix compared cell by cell
  let reproducibility = null;
  const rerunFile = path.join(RAW, 'stability-chromium-rerun.jsonl');
  if (fs.existsSync(rerunFile)) {
    const again = load('chromium', true).cells;
    let same = 0;
    for (const [k, cell] of ref) if (again.get(k) && again.get(k).region === cell.region && again.get(k).context === cell.context) same++;
    reproducibility = { browser: 'chromium', cells: ref.size, identical_digests: same };
  }

  const failures = {};
  let total = 0;
  for (const bn of BROWSERS) {
    let f = 0;
    for (const c of data[bn].cells.values()) {
      total++;
      if (c.err) f++;
    }
    failures[bn] = f;
  }
  const summary = {
    generated_at: new Date().toISOString(),
    corpus: { pages: pages.corpusSize, provenance: 'synthetic, generated by research/corpus/pages.cjs; not captured from any website' },
    matrix: { viewports: VIEWPORTS.map((v) => v.name), dprs: DPRS, fonts: FONTS, browsers: BROWSERS.map((n) => data[n].meta.label), cells_total: total, webkit: 'NOT MEASURED (not available on this machine)' },
    render_failures: failures,
    axes: Object.fromEntries(
      Object.entries(axes).map(([name, a]) => {
        const ok = a.comparisons - a.failures;
        return [name, { ...a, region_agreement: ok ? a.region_agree / ok : null, region_ci95: wilson(a.region_agree, ok), context_agreement: ok ? a.context_agree / ok : null }];
      }),
    ),
    archetype_browser_axis: archetype,
    interfaces_with_any_browser_axis_disagreement: Object.keys(perInterface).length,
    reproducibility,
  };
  fs.writeFileSync(path.join(RESULTS, 'stability-real.json'), JSON.stringify(summary, null, 1) + '\n');
  writeTables(summary);
  console.log('wrote research/results/stability-real.json, stability-table.md, stability-table.tex');
}

const pct = (x) => (x == null ? 'n/a' : (100 * x).toFixed(2) + '%');

function writeTables(s) {
  const L = [];
  L.push('# Stability of the render digest (milestone 6.1, real rendering)');
  L.push('');
  L.push(`Generated ${s.generated_at}. ${s.corpus.pages} synthetic pages (${s.corpus.provenance}). Browsers: ${s.matrix.browsers.join('; ')}. Safari/WebKit: ${s.matrix.webkit}.`);
  L.push(`Matrix: ${s.matrix.viewports.join(', ')} viewports x DPR ${s.matrix.dprs.join('/')} x fonts (${s.matrix.fonts.join(', ')}) = ${s.matrix.cells_total} measured cells. Render failures per browser: ${JSON.stringify(s.render_failures)}.`);
  L.push('Agreement = the region digest is byte-identical to the reference cell. 95% intervals are Wilson intervals over comparisons (comparisons are not independent, so they are indicative only).');
  L.push('');
  L.push('| Axis | What is compared | Comparisons | Region agreement | 95% CI | Context agreement |');
  L.push('|---|---|---|---|---|---|');
  const what = { browser: 'Chrome, Edge, Firefox vs bundled Chromium (same viewport, DPR, font)', dpr: '2x and 3x vs 1x (same browser, viewport, font)', font: 'fallback vs default font (same browser, viewport, DPR)', viewport: 'each viewport vs 1280x800 (same browser; DPR 1, default font) -- the responsive axis, reported separately' };
  for (const [name, a] of Object.entries(s.axes)) {
    L.push(`| ${name} | ${what[name]} | ${a.comparisons - a.failures} | ${pct(a.region_agreement)} | ${pct(a.region_ci95[0])} to ${pct(a.region_ci95[1])} | ${pct(a.context_agreement)} |`);
  }
  L.push('');
  L.push('## Disagreements by cause (primary differing feature of the first differing node)');
  L.push('');
  for (const [name, a] of Object.entries(s.axes)) {
    L.push(`### ${name} axis`);
    L.push('');
    const keys = Object.keys(a.causes).filter((k) => !k.includes(':media_query') && !k.includes(':no_media'));
    if (!keys.length) L.push('No disagreements.');
    else {
      L.push('| Which digest : cause | Count |');
      L.push('|---|---|');
      for (const k of keys.sort((x, y) => a.causes[y] - a.causes[x])) L.push(`| ${k} | ${a.causes[k]} |`);
    }
    if (name === 'viewport') {
      const act = Object.entries(a.causes).filter(([k]) => k.includes(':media_query_active')).reduce((t, [, v]) => t + v, 0);
      const no = Object.entries(a.causes).filter(([k]) => k.includes(':no_media_query_change')).reduce((t, [, v]) => t + v, 0);
      L.push('');
      L.push(`Of the viewport disagreements, ${act} were on pages whose media query is active at the smaller viewport (expected re-layout) and ${no} on pages with no media-query change (geometry alone: wrapping, clipping, fixed-size containers).`);
    }
    L.push('');
    L.push('| Group | Comparisons | Region agreement |');
    L.push('|---|---|---|');
    for (const [g, v] of Object.entries(a.by_group)) L.push(`| ${g} | ${v.comparisons} | ${pct(v.comparisons ? v.region_agree / v.comparisons : null)} |`);
    L.push('');
  }
  L.push('## By layout archetype (browser axis)');
  L.push('');
  L.push('| Archetype | Comparisons | Region disagreements |');
  L.push('|---|---|---|');
  for (const [k, v] of Object.entries(s.archetype_browser_axis)) L.push(`| ${k} | ${v.comparisons} | ${v.disagree} |`);
  L.push('');
  L.push(`Interfaces with at least one browser-axis disagreement: ${s.interfaces_with_any_browser_axis_disagreement} of ${s.corpus.pages}.`);
  if (s.reproducibility) L.push(`\nReproducibility: a second full Chromium run produced identical digests in ${s.reproducibility.identical_digests} of ${s.reproducibility.cells} cells.`);
  L.push('');
  L.push('Examples of the first differing node for each cause are in `stability-real.json` (axes.*.examples).');
  fs.writeFileSync(path.join(RESULTS, 'stability-table.md'), L.join('\n') + '\n');

  const BS = String.fromCharCode(92);
  const T = ['% Generated by research/harness/stability-real.cjs from stability-real.json'];
  T.push(BS + 'begin{tabular}{llrrr}');
  T.push(BS + 'hline Axis & Compared & Comparisons & Region agreement & Context agreement ' + BS + BS + ' ' + BS + 'hline');
  for (const [name, a] of Object.entries(s.axes)) T.push(name + ' & ' + what[name].split(' (')[0].replace(/[&%_]/g, ' ') + ' & ' + (a.comparisons - a.failures) + ' & ' + pct(a.region_agreement).replace('%', BS + '%') + ' & ' + pct(a.context_agreement).replace('%', BS + '%') + ' ' + BS + BS);
  T.push(BS + 'hline' + BS + 'end{tabular}');
  fs.writeFileSync(path.join(RESULTS, 'stability-table.tex'), T.join('\n') + '\n');
}

const [cmd, arg, flag] = process.argv.slice(2);
if (cmd === 'run') run(arg, flag === 'rerun').catch((e) => (console.error(e), process.exit(1)));
else if (cmd === 'analyse') analyse();
else console.log('usage: stability-real.cjs run <browser> [rerun] | analyse');
