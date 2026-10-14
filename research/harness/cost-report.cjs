/**
 * Renders research/results/cost-real.json as research/results/cost-table.md.
 * Every number in the table is read from the JSON; nothing is typed in here.
 *
 *   node research/harness/cost-report.cjs
 */
const fs = require('fs');
const path = require('path');

const RESULTS = path.resolve(__dirname, '../results');
const d = JSON.parse(fs.readFileSync(path.join(RESULTS, 'cost-real.json'), 'utf8'));
const kb = (b) => (b / 1024).toFixed(2);
const ms = (x) => `${x} ms`;
const status = (value, limit) => (value <= limit ? 'met' : '**MISSED**');

const L = [];
L.push('# Cost measurements (milestone 6.3)');
L.push('');
L.push(`Measured ${d.env.measured_at} on one development machine: ${d.env.cpu}, ${d.env.logical_cores} logical cores, ${d.env.memory_gb} GB, ${d.env.os}, Node ${d.env.node}, Chromium ${d.env.chromium}, Attestor ${d.env.attestor_version}.`);
L.push('');
L.push('Median (p50) and 95th percentile (p95) are reported, never the mean. Every component measured is the real one: the built Attestor Module in real Chromium, the real verifier, the real PHP Merkle log, and an evidence pack downloaded from the running server. **No physical phone was used.** The "mobile" rows below are an emulated 4x CPU slowdown on the machine above; they are a proxy, not a measurement of any phone. `research/results/mobile-timing.html` runs the same measurement on a real device and has not been run yet.');
L.push('');

L.push('## 1. Client digest latency (target: p95 <= 50 ms, mid-range mobile)');
L.push('');
L.push(`${d.env.runs_per_cell} timed runs per row after 20 warm-up runs. \`attest()\` is the whole client-side step (measure both regions, canonicalise, hash in the worker). "Measure only" is the main-thread part.`);
L.push('');
L.push('| Region | Nodes measured (region / page) | Condition | attest() p50 | attest() p95 | attest() p99 | measure only p50 | measure only p95 | vs 50 ms target |');
L.push('|---|---|---|---|---|---|---|---|---|');
for (const [label, cell] of Object.entries(d.digest_latency)) {
  for (const [cond, name] of [['this_machine', 'this machine (desktop)'], ['emulated_4x_cpu_slowdown', 'emulated 4x CPU slowdown (proxy for a phone)']]) {
    const c = cell[cond];
    L.push(`| ${label} | ${c.nodes_measured.region} / ${c.nodes_measured.context} | ${name} | ${ms(c.attest_ms.p50)} | ${ms(c.attest_ms.p95)} | ${ms(c.attest_ms.p99)} | ${ms(c.measure_only_ms.p50)} | ${ms(c.measure_only_ms.p95)} | ${status(c.attest_ms.p95, 50)} |`);
  }
}
L.push('');

const p = d.payload_sizes;
L.push('## 2. Payload sizes (target: <= 50 KB total)');
L.push('');
L.push('Taken from one real consent flow on the running server (an accepted attestation, then the evidence pack downloaded through `/api/pack/{id}/download`). One interface only; sizes grow with the notice.');
L.push('');
L.push('| Artifact | Bytes | KB |');
L.push('|---|---|---|');
L.push(`| Sealed bundle (markup + CSS) | ${p.sealed_bundle_bytes} | ${kb(p.sealed_bundle_bytes)} |`);
L.push(`| Whole \`/api/bundle\` response (bundle + commitment + signature) | ${p.bundle_response_bytes} | ${kb(p.bundle_response_bytes)} |`);
L.push(`| \`/api/attest\` request body | ${p.attestation_request_bytes} | ${kb(p.attestation_request_bytes)} |`);
L.push(`| Evidence pack (zip) | ${p.evidence_pack_zip_bytes} | ${kb(p.evidence_pack_zip_bytes)} |`);
L.push(`| Evidence pack contents, uncompressed (${p.evidence_pack_entries.length} files) | ${p.evidence_pack_uncompressed_bytes} | ${kb(p.evidence_pack_uncompressed_bytes)} |`);
L.push('');
L.push(`All are under the 50 KB target (largest: pack ${kb(p.evidence_pack_zip_bytes)} KB): ${p.evidence_pack_zip_bytes <= 51200 ? 'met' : '**MISSED**'}.`);
L.push('');
L.push('| Pack file | Bytes | Compressed |');
L.push('|---|---|---|');
for (const e of p.evidence_pack_entries) L.push(`| ${e.file} | ${e.bytes} | ${e.compressed_bytes} |`);
L.push('');

const v = d.verifier_throughput;
L.push('## 3. Verifier throughput (target: >= 600 packs/min, one instance)');
L.push('');
L.push(`The real pack from section 2, verified by the real verifier. First result on that pack: **${v.first_result.verdict}** (ok = ${v.first_result.ok}). ${v.first_result.message ?? ''}`);
L.push('');
L.push('| Pipeline | Packs timed | Packs / minute | p50 per pack | p95 per pack | vs 600/min target |');
L.push('|---|---|---|---|---|---|');
const s1 = v.stages_1_to_10;
const s11 = v.stage_11_rerender_warm_browser;
L.push(`| Stages 1-10 (parsing, signatures, hashes, Merkle proofs, policy, registry) | ${s1.packs} | ${s1.packs_per_minute} | ${ms(s1.latency_ms.p50)} | ${ms(s1.latency_ms.p95)} | ${s1.packs_per_minute >= 600 ? 'met' : '**MISSED**'} |`);
L.push(`| Stage 11 re-render in a warm Chromium (one pack at a time) | ${s11.packs} | ${s11.packs_per_minute} | ${ms(s11.latency_ms.p50)} | ${ms(s11.latency_ms.p95)} | ${s11.packs_per_minute >= 600 ? 'met' : '**MISSED**'} |`);
L.push('');
L.push(`Last stage-11 verdict on the honest pack: **${s11.last_verdict.verdict}** (ok = ${s11.last_verdict.ok}). ${s11.last_verdict.message ?? ''}`);
L.push('');
L.push('Stages 1-10 time only the cheap checks in one Node process. Stage 11 launches no new browser per pack here (one warm browser, a new context and page per pack).');
L.push('');

if (d.merkle_proofs) {
  L.push('## 4. Merkle inclusion proofs (target: < 100 ms at 100,000 leaves; logarithmic growth)');
  L.push('');
  L.push(`The real PHP \`MerkleLog::inclusionProof\` on MariaDB, ${d.merkle_proofs.samples_per_size} random leaves per size, PHP ${d.merkle_proofs.php}. Logs were bulk-loaded with the test loader (not the production append path).`);
  L.push('');
  L.push('| Leaves | Path hashes (min-max) | ceil(log2 n) | Generate p50 | Generate p95 | Verify p50 | Bulk load |');
  L.push('|---|---|---|---|---|---|---|');
  for (const s of d.merkle_proofs.sizes) {
    L.push(`| ${s.leaves.toLocaleString('en-US')} | ${s.path_hashes_min}-${s.path_hashes_max} | ${s.ceil_log2} | ${ms(s.generate_ms.p50)} | ${ms(s.generate_ms.p95)} | ${ms(s.verify_ms.p50)} | ${s.bulk_load_seconds} s |`);
  }
  L.push('');
}

L.push('## Reproducing');
L.push('');
L.push('1. Database running on the port in `server/.env`, migrated, Attestor registered.');
L.push('2. `MRA_COST_DUMP=<dir> MRA_NO_TAMPER=1 node e2e/full-stack.cjs` captures the real bundle, attestation and pack.');
L.push('3. `php bin/measure_proofs.php 200 > research/results/cost-merkle.json` (from `server/`, with sodium enabled).');
L.push('4. `node research/harness/cost-real.cjs <dir> 500`, then `node research/harness/cost-report.cjs`.');
L.push('');

fs.writeFileSync(path.join(RESULTS, 'cost-table.md'), L.join('\n'));
console.log('wrote research/results/cost-table.md');
