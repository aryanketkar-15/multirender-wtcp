# Cost measurements (milestone 6.3)

Measured 2026-10-14T18:48:44.027Z on one development machine: AMD Ryzen 7 7840HS w/ Radeon 780M Graphics, 16 logical cores, 15 GB, Windows_NT 10.0.26200, Node v22.20.0, Chromium 153.0.8010.12, Attestor 1.0.0.

Median (p50) and 95th percentile (p95) are reported, never the mean. Every component measured is the real one: the built Attestor Module in real Chromium, the real verifier, the real PHP Merkle log, and an evidence pack downloaded from the running server. **No physical phone was used.** The "mobile" rows below are an emulated 4x CPU slowdown on the machine above; they are a proxy, not a measurement of any phone. `research/results/mobile-timing.html` runs the same measurement on a real device and has not been run yet.

Digest latency and Merkle figures: run of 2026-10-14T18:48:44.027Z on a quiet machine. Payload sizes and verifier throughput: re-run of 2026-10-15T05:32:33.024Z against a new real pack after the stage-11 fix; the machine was busier during that re-run (its own digest-latency figures were 1.7x to 2.8x slower and were discarded), so the throughput figures are conservative.

## 1. Client digest latency (target: p95 <= 50 ms, mid-range mobile)

500 timed runs per row after 20 warm-up runs. `attest()` is the whole client-side step (measure both regions, canonicalise, hash in the worker). "Measure only" is the main-thread part.

| Region | Nodes measured (region / page) | Condition | attest() p50 | attest() p95 | attest() p99 | measure only p50 | measure only p95 | vs 50 ms target |
|---|---|---|---|---|---|---|---|---|
| small | 22 / 23 | this machine (desktop) | 3.4 ms | 5.1 ms | 8.4 ms | 2.8 ms | 3.9 ms | met |
| small | 22 / 23 | emulated 4x CPU slowdown (proxy for a phone) | 20.6 ms | 28.6 ms | 31.9 ms | 18.6 ms | 25.1 ms | met |
| standard | 52 / 53 | this machine (desktop) | 6.6 ms | 9.3 ms | 11.4 ms | 5.5 ms | 6.7 ms | met |
| standard | 52 / 53 | emulated 4x CPU slowdown (proxy for a phone) | 37.7 ms | 51.5 ms | 64.5 ms | 34.9 ms | 46.2 ms | **MISSED** |
| large | 502 / 503 | this machine (desktop) | 48.6 ms | 58.1 ms | 63.4 ms | 43.2 ms | 49.4 ms | **MISSED** |
| large | 502 / 503 | emulated 4x CPU slowdown (proxy for a phone) | 315 ms | 379.8 ms | 406.7 ms | 301.9 ms | 368.6 ms | **MISSED** |

## 2. Payload sizes (target: <= 50 KB total)

Taken from one real consent flow on the running server (an accepted attestation, then the evidence pack downloaded through `/api/pack/{id}/download`). One interface only; sizes grow with the notice.

| Artifact | Bytes | KB |
|---|---|---|
| Sealed bundle (markup + CSS) | 1177 | 1.15 |
| Whole `/api/bundle` response (bundle + commitment + signature) | 2428 | 2.37 |
| `/api/attest` request body | 1054 | 1.03 |
| Evidence pack (zip) | 5760 | 5.63 |
| Evidence pack contents, uncompressed (8 files) | 8990 | 8.78 |

All are under the 50 KB target (largest: pack 5.63 KB): met.

| Pack file | Bytes | Compressed |
|---|---|---|
| manifest.json | 1297 | 529 |
| bundle.json | 1232 | 669 |
| commitment.json | 1009 | 568 |
| attestation.json | 1389 | 801 |
| client_pubkey.pem | 177 | 151 |
| inclusion_proof_commitment.json | 1515 | 786 |
| inclusion_proof_attestation.json | 1977 | 1041 |
| signed_tree_head.json | 394 | 273 |

## 3. Verifier throughput (target: >= 600 packs/min, one instance)

The real pack from section 2, verified by the real verifier. First result on that pack: **PROCEEDS_TO_RENDER** (ok = true). All stages 1-10 cheap checks passed successfully; proceeds to render stage.

| Pipeline | Packs timed | Packs / minute | p50 per pack | p95 per pack | vs 600/min target |
|---|---|---|---|---|---|
| Stages 1-10 (parsing, signatures, hashes, Merkle proofs, policy, registry) | 1000 | 24582 | 2.119 ms | 4.432 ms | met |
| Stage 11 re-render in a warm Chromium (one pack at a time) | 50 | 328 | 172.558 ms | 221.43 ms | **MISSED** |

Last stage-11 verdict on the honest pack: **VERIFIED** (ok = true). All 11 verification stages passed: Evidence pack is mutually verified.

Stages 1-10 time only the cheap checks in one Node process. Stage 11 launches no new browser per pack here (one warm browser, a new context and page per pack).

## 4. Merkle inclusion proofs (target: < 100 ms at 100,000 leaves; logarithmic growth)

The real PHP `MerkleLog::inclusionProof` on MariaDB, 200 random leaves per size, PHP 8.2.12. Logs were bulk-loaded with the test loader (not the production append path).

| Leaves | Path hashes (min-max) | ceil(log2 n) | Generate p50 | Generate p95 | Verify p50 | Bulk load |
|---|---|---|---|---|---|---|
| 10,000 | 12-14 | 14 | 6.6752 ms | 8.2902 ms | 0.0283 ms | 1.7 s |
| 100,000 | 12-17 | 17 | 6.9825 ms | 9.6689 ms | 0.0298 ms | 10.8 s |
| 1,000,000 | 19-20 | 20 | 13.0158 ms | 19.585 ms | 0.0377 ms | 103.3 s |

## Reproducing

1. Database running on the port in `server/.env`, migrated, Attestor registered.
2. `MRA_COST_DUMP=<dir> MRA_NO_TAMPER=1 node e2e/full-stack.cjs` captures the real bundle, attestation and pack.
3. `php bin/measure_proofs.php 200 > research/results/cost-merkle.json` (from `server/`, with sodium enabled).
4. `node research/harness/cost-real.cjs <dir> 500`, then `node research/harness/cost-report.cjs`.
