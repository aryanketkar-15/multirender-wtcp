# Milestone 7.3: Regression Sweep, Coverage and Load Report (corrected)

**Project:** PS-3 Mutual Render Attestation (MRA)
**Group:** TY-A9, Department of Computer Engineering, Vishwakarma Institute of Technology, Pune
**Faculty Guide:** Prof. Rahul Diwate
**Measured:** 2026-10-20 on branch `feat/professional-ui-redesign`, Windows 11, AMD Ryzen 7 7840HS
**Replaces:** the 2026-10-18 version of this report, which could not be reproduced (see section 8).

Every number below was produced by running the command shown, on the date above. Where something could not be measured, this report says so instead of giving a figure.

---

## 1. Suites

| Module | Runner | Suites | Tests | Passed | Skipped | Failed | Command |
|---|---|---|---|---|---|---|---|
| Server | PHPUnit 10.5, PHP 8.2.12 | 10 directories | 431 (12,687 assertions) | 431 | 0 | 0 | `vendor/bin/phpunit` in `server/` (needs the database) |
| Server style | PHP_CodeSniffer, PSR-12 | | | clean | | | `vendor/bin/phpcs` |
| Attestor | Jest 29.7 + real Chromium | 9 | 235 | 235 | 0 | 0 | `npx jest` in `attestor/` |
| Verifier | Jest 29.7 + real Chromium | 6 | 35 | 35 | 0 | 0 | `npx jest` in `verifier/` |
| Client | Jest 29.7, jsdom | 16 | 176 | 176 | 0 | 0 | `npx jest` in `client/` (plus `tsc --noEmit`, ESLint with 0 errors, `vite build`) |
| **Total** | | | **877** | **877** | **0** | **0** | |

Live end-to-end runs (`node e2e/full-stack.cjs`, real PHP server, real database, real Attestor in a real browser):

| Run | Result |
|---|---|
| Honest flow, bundled Chromium 153 (`MRA_NO_TAMPER=1`) | 21 of 21 checks |
| Page rewritten after load, bundled Chromium 153 | 20 of 20 checks |
| Same consent flow in installed Chrome 155 (`MRA_CHANNEL=chrome`) | 20 of 20 checks |
| Same consent flow in installed Edge 155 (`MRA_CHANNEL=msedge`) | 20 of 20 checks |

The previous report counted 106 attestor tests as "skipped". In this run the attestor suite executes completely (235 passed, 0 skipped) because the browser tests run headless under Playwright.

## 2. Test cases

| ID | Scenario | Evidence | Status |
|---|---|---|---|
| T7.3.1 | All suites green | Section 1 | **PASS** |
| T7.3.2 | Honest path: register, sign in, consent, evidence pack, verify | `e2e/full-stack.cjs` produces a real pack; the verifier returns `VERIFIED` for it (`verifier/tests/realPacks.test.ts`, and run by hand on the pack of this run) | **PASS** |
| T7.3.3 | Attack 1: notice altered after load | Real pack from a live run; verifier returns `DIGEST_MISMATCH` and names the paragraph with both texts (`realPacks.test.ts`) | **PASS** |
| T7.3.4 | Attack 2: reject control degraded (size, contrast) | Verifier test T5.3.3 (shrunk, greyed reject button detected with bucket changes shown); mutation suite M-14 detected 175 of 175 | **PASS** |
| T7.3.5 | Attack 3: attestation edited after signing | Verifier test T5.2.4 returns `CLIENT_SIGNATURE_INVALID`; live end-to-end also refuses an altered attestation (401) | **PASS** |
| T7.3.6 | Coverage at least 75% for every module | Client measured (section 3). Attestor, verifier and server **could not be measured** | **NOT MET** (client only) |
| T7.3.7 | Consent flow across four desktop engines | Passes in bundled Chromium 153, Chrome 155 and Edge 155 (all Blink). **Not run through the application in Firefox.** Digest stability in Firefox was measured separately (PROJECT_LOG section 18) | **PARTIAL (3 of 4)** |
| T7.3.8 | 100 simultaneous attestations | Section 4. The first real run **failed** and exposed a bug, now fixed | **PASS after fix** |
| T7.3.9 | No secrets in git history | `git log -p --all` searched for private-key blocks and assignments of the secret variables with a value of 16 or more characters: 0 matches. Only `.env.example` files are tracked | **PASS** |
| T7.3.10 | No plaintext personal data at rest | The `users` table holds `email_enc` and `name_enc` (XChaCha20-Poly1305 ciphertext) and `email_bidx` (HMAC blind index); inspected directly in the database. Tests: `EncryptedLogColumnsTest`, `UserRepositoryTest` | **PASS** |
| T7.3.11 | Evidence tables are append-only for the application | `server/tests/Repository/GrantPolicyTest.php` runs `UPDATE` and `DELETE` as the restricted account and expects them denied | **PASS** |
| (added) | Accessibility, automated | axe-core 4.10 (WCAG 2.0/2.1 A and AA rules) on 12 page states at 1280 px and at 375 px: **0 violations**, no horizontal overflow (section 5) | **PASS** |

## 3. Coverage

| Module | Statements | Branches | Functions | Lines | How |
|---|---|---|---|---|---|
| Client | 83.91% | 79.63% | 78.19% | 85.51% | `npx jest --coverage` |
| Attestor | not measurable | | | | The code under test runs inside Chromium; Jest's instrumentation does not see it (it reported 38% while all 235 tests passed) |
| Verifier | not measurable | | | | Instrumentation breaks the functions the tests send into the browser (11 tests fail under `--coverage`, 35 of 35 pass without it) |
| Server | not measurable | | | | No PHP coverage driver (Xdebug or PCOV) is installed here |

A browser-level coverage run (V8 coverage through Playwright) and a PHP driver would be needed to close this gap.

## 4. Concurrency (T7.3.8)

Tool: `server/bin/load_attest.php 100`. It prepares 100 verified users, each with a session, a registered client key and a committed bundle, then starts 100 operating-system processes that submit their attestation at the same instant through the real kernel against the real database. It then checks the log. There is no HTTP layer in this test because PHP's built-in server handles one request at a time.

**First real run (5 processes): 2 of 5 failed** with HTTP 500, `Duplicate entry for key PRIMARY`. Cause: the log's append lock was released as soon as the leaf row was inserted, but the surrounding attestation transaction committed later, so the next writer read a stale log size and chose the same leaf index. Nothing was corrupted (the primary key refused the duplicate) but users would have seen errors. Fix: `MerkleLog::whileLocked()` holds the lock until the attestation transaction has committed. Regression test: `AttestationLoadTest` (8 simultaneous users).

**Run after the fix (100 processes, `research/results/load-test.json`):**

| Measure | Result |
|---|---|
| Completed with 201 | 100 of 100 |
| Failures, nonce replays | 0, 0 |
| Latency per request | median 456 ms, p95 705 ms, max 728 ms |
| Wall clock for all 100 | 11.4 s |
| Log leaves | 200 (100 commitments and 100 attestations), indices unique and contiguous from 0 |
| Every attestation leaf after its commitment leaf | yes |
| Attestation leaf immediately after its commitment leaf | 0 of 100 (they interleave under concurrency, as expected) |
| Signed tree head over all 200 leaves | inclusion proof valid for 200 of 200 leaves |

The latency includes lock queuing: all 100 writers serialise on the log append. It is not a throughput figure for a web deployment.

## 5. Accessibility and layout

Method: `axe-core` 4.10.2 injected with Playwright; rules tagged `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. States: home (signed out and in), register, login, forgot password, verifier (empty, verified result, mismatch result), packs (empty and one pack), consent (ready and recorded), at 1280 x 800 and 375 x 667.

Found on the branch before refinement: filled buttons white on `#3b82f6` (3.67:1), muted text `#64748b` on the dark canvas (4.01:1), the attack verdict badge (3.76:1), a drop zone that was a button containing buttons (`nested-interactive`), and a scrollable comparison table that keyboard users could not focus. All fixed (PROJECT_LOG section 26). After the fixes: 0 violations in all 24 page states and no horizontal overflow at 375 px.

Automated rules cover only part of WCAG. A manual screen-reader pass was not done.

## 6. Security checks

- Secrets in history: section 2, T7.3.9.
- Personal data at rest: section 2, T7.3.10.
- Database privileges: section 2, T7.3.11.
- Evidence integrity: signatures, bindings, Merkle proofs and the replay protections are covered by the server, client, attestor and verifier suites above.

## 7. Not tested

- A physical phone (mobile latency, touch).
- Safari/WebKit and non-Windows systems.
- The consent flow in Firefox through the application.
- Real SMTP delivery, the WebAuthn tier, a real external witness for tree heads, CI on GitHub.
- HTTP-level concurrency (a multi-process web server).

## 8. Corrections to the 2026-10-18 report

| Earlier statement | Finding |
|---|---|
| Attestor: 129 passed and 106 skipped, "100% pass rate" | Not reproducible: 235 pass, 0 skipped. The pass rate counted skipped tests as passes |
| Coverage 88.4 / 94.2 / 86.7 / 79.5 per module | No coverage artefact existed. Only the client figure could be reproduced (83.9% statements) |
| Load test: 100 of 100, median 26.8 ms, 138 req/s, 0 deadlocks, paired leaves adjacent | Not reproducible: no tool produced `load-test.json`. A real run found a locking bug (section 4); the real median is 456 ms and paired leaves are never adjacent under concurrency |
| Tables `mra_users`, `mra_evidence_commitments`, `mra_merkle_nodes`; columns `email_blind_index`, `encrypted_profile`; database account `mra_app`@`localhost` | These do not exist in this codebase. The real names are in section 2 |
| Cross-browser consent flow in four engines "complete" | Three Blink builds; Firefox not run through the application |
