# Handoff: everything a new agent needs

Read this first. It is written for an AI agent or developer joining the project cold. Written 2026-10-10.

## 1. The project in one paragraph

**PS-3 Mutual Render Attestation** (Group TY-A9, VIT Pune, Web Technologies, faculty Prof. Rahul Diwate). When a user clicks "I agree", the company's record of what the screen showed is one-sided. Our system produces evidence neither side can forge alone: (1) before interaction the server signs a **commitment** to a sealed, hashed render bundle (Ed25519); (2) at the moment of the click the user's browser computes a **semantic digest** of the real page (via an independently hosted **Attestor Module**) and signs it with a non-extractable ECDSA P-256 key; (3) both go into an **append-only RFC 6962 Merkle log** whose signed heads are published externally; (4) an **independent verifier** (NOT BUILT YET) re-renders the committed bundle and compares digests. Reasons, rejected alternatives and prior art are in `PROJECT_LOG.md` (decisions D-01..D-35).

## 2. Source-of-truth documents (all in this repo)

| File | Purpose |
|---|---|
| `PROJECT_LOG.md` | Decisions with rationale and rejected alternatives, late changes, findings, measurements, open items, verified checklists. Sections 10-13 are the build record for phases 1-4. **Append, never rewrite.** |
| `docs/BUILD_PLAYBOOK.md` | The build plan (phases 0-7, milestones, test cases). Statuses maintained: ✅ covered by a test, ◐ partial, ☐ unverified. Phase checkpoints hold commit hashes. |
| `docs/FACULTY_BRIEFING.md`, `docs/DEMO.md` | Presenting the project and running the demo (PowerShell). |
| `docs/attestor-release.md` | How to release the Attestor Module. |
| `README.md` | Module overview and quick start. |
| The design document PDF | Outside the repo (the user's Downloads: "PS-3 Mutual Render Attestation: Proposed Solution"). Architecture, protocol, attack model. |

**Standing instruction from the user:** keep `BUILD_PLAYBOOK.md` and `PROJECT_LOG.md` current at the end of every milestone, in the repo. Tick a test case only when a test covers it. The user's originals in `C:\Users\aryan\Downloads\` are separate copies; do not overwrite files outside the repo without asking.

## 3. Repository layout (`C:\Users\aryan\WT_CP\mra`)

```
client/     React + TypeScript (Vite). Consent UI, account UI, admin page, in-browser log check.
attestor/   Independent Attestor Module: zero runtime deps, built to ONE file with an embedded worker. dist/ committed on tag attestor-v1.0.0.
server/     PHP 8.2, no framework. public/index.php is the only web-reachable file. src/{Controller,Service,Repository,Crypto,Validation,Middleware,Http,Mail,Log,Model,Support}, migrations/, bin/, tests/.
verifier/   Node + Playwright. ONLY A SCAFFOLD (smoke test). Phase 5 builds it here.
research/   harness/cross-browser-informal.cjs (seed of the Phase 6 harness); corpus/, mutations/, results/ empty.
e2e/        full-stack.cjs: real-browser end-to-end run (20 checks).
docs/       the documents above.
```

## 4. Stack and key technical facts

- **Server:** PHP 8.2 + sodium + openssl; MariaDB/MySQL via PDO with server-side prepares; `BaseRepository::run()` refuses any SQL containing quote characters (bind parameters). Custom DB-backed sessions (cookie token hashed in the DB), idle 30 min / absolute 12 h, cookies Secure+HttpOnly+SameSite=Strict, CSRF header `X-CSRF-Token` on state-changing requests with a session. Argon2id passwords; XChaCha20-Poly1305 field encryption with column-bound AAD; HMAC blind index for email lookup; OTP bcrypt-hashed; throttling on account and IP.
- **Protocol objects:** bundle (RFC 8785 canonical JSON, `bundle_hash`), commitment (signed Ed25519, contains `log_leaf_index`, `client_pubkey_fpr`, `attestor_hash`, nonce), attestation (ECDSA P-256 over JCS, IEEE P1363 signature as base64url, bound to `commitment_hash` not `bundle_hash`), signed tree head.
- **Server routes:** `/api/register`, `/api/otp/{request,verify}`, `/api/session`, `/api/login`, `/api/logout`, `/api/password/{forgot,reset}`, `/api/client-key`, `/api/bundle`, `/api/attest`, `/api/admin/consent`, `/api/pack/{id}` (stub), `/api/log/{head,proof/{index},consistency}`, `/.well-known/mra-key`.
- **Attestor:** extraction (role allowlist), normalisation (NFKC, strip invisibles, case fold, whitespace; order fixed), six bucketed style features + visibility/occlusion, representation `srd/1.0`, two digests (critical region and whole page), computed in a Web Worker. Loaded by the client under SRI from a separate origin and re-hashed against the commitment's `attestor_hash`.
- **Merkle log:** tables `mra_leaf`, `mra_node`, `mra_sth`, `mra_sth_publication`; append under a MySQL named lock; the commitment signs its own leaf index. `GrantPolicy` gives the app account SELECT+INSERT only on evidence tables.
- **Validation order for `/api/attest`:** schema, signature, then DB checks; eleven distinct error codes (`SCHEMA_INVALID`, `CLIENT_SIGNATURE_INVALID`, `KEY_BINDING_INVALID`, `COMMITMENT_UNKNOWN`, `SESSION_MISMATCH`, `NONCE_MISMATCH`, `REPLAY_DETECTED`, `COMMITMENT_EXPIRED`, `ATTESTOR_UNRECOGNISED`, `ATTESTOR_MISMATCH`, `ACTION_TARGET_INVALID`, `REGION_POLICY_VIOLATION`). Nonce consumed last, atomically.
- **Migrations** `001`-`021`, numbered in build order (the playbook's numbers differ; that is recorded).

## 5. Current state (honest, updated 2026-10-15)

| Playbook phase | State |
|---|---|
| 0 to 4 | Done (CI config written, never run on GitHub; WebAuthn not built) |
| 5 Evidence pack and verifier | Built and verified end to end on the real stack (PROJECT_LOG 21, 22). Honest real pack: VERIFIED. Page rewritten after load: DIGEST_MISMATCH **naming the paragraph and showing both texts** (Attestor 1.1.0 ships the region representation; the pack carries `representation.json`; the verifier replays with the exact attested build). A VERIFIED verdict covers the critical region only: the context digest is not replayable (O-08, D-49). Packs from Attestor 1.0.0 mismatch without a node name. |
| 6.1 stability matrix, 6.2 mutation suite | **Redone with real rendering** (PROJECT_LOG 18, 19): 24,000 real renders in Chromium, Chrome, Edge, Firefox over a *synthetic* 200-page corpus (browser 99.43%, DPR 100%, **font 84.97%**, viewport 61.41% agreement); 20 mutations on the real DOM, 0 false positives on the control, one real blind spot (overlay below the fold). Safari not measured. Raw data is git-ignored; regenerate with `research/harness/stability-real.cjs run <browser>` then `analyse`. |
| 6.3 cost measurement | **Redone with real components** (PROJECT_LOG 20): 500-node digest p95 58 ms on a desktop (target 50), stage-11 re-render 383 packs/min (target 600), proofs and payloads fine. **No physical phone has been used**: run `research/results/mobile-timing.html` on one. |
| 7 Polish, accessibility, report, demo | Started, uncommitted in the working tree (design system, EmptyState/ErrorBoundary/Skeleton, CSS, a CI edit). |

Latest counts: verifier 30 tests; e2e 20/20 (`MRA_NO_TAMPER=1` and `MRA_COST_DUMP=<dir>` capture a clean run and its artifacts). The research package has no installed dependencies in this checkout, so its Jest suites are unverified.

## 6. Things that are NOT done or NOT proven (do not claim them)

- Any claim about real-world consent banners (corpus is synthetic), Safari/WebKit, other operating systems, or font-independence (the digest changes under font substitution).
- Any mobile latency figure (no phone used).
- Anything outside the critical region being verified (the context digest is not compared by default, D-49).
- External witness (O-02), real SMTP, CI runs, second-machine reproducibility (O-09), Safari/other OS (O-10), units III/IV question to Prof. Rahul Diwate (O-01).
- The faculty for this project is **Prof. Rahul Diwate**.


## 7. Running everything on the user's machine (Windows, PowerShell 5.1: no `&&`)

```powershell
function php { & C:\xampp\php\php.exe -d extension=sodium -d extension=zip @args }
```
1. **Database:** MariaDB must listen on **port 3307** (a throwaway instance; XAMPP's own MariaDB has corrupt system tables, do not use it). It was started by a script in the agent's scratchpad (`start-db.sh` running `C:\xampp\mysql\bin\mysqld.exe --datadir=<scratchpad>\mariadb\data --port=3307`). It dies when its parent process is killed; check with `(netstat -ano | Select-String ":3307 " | Select-String LISTENING).Count`. Data dir, DB user and credentials live in the scratchpad and `server/.env` (gitignored). If it is gone: create a fresh MariaDB datadir, databases `mra` and `mra_test`, a user with ALL on both and on `mra\_%` (migration tests create scratch DBs), set `DB_PORT/DB_USER/DB_PASS` in `server/.env`, run `php bin\migrate.php up` and `php bin\migrate.php up --test`.
2. **Servers (three windows):** `Set-Location server; php -S 127.0.0.1:8080 -t public dev-router.php` · `Set-Location attestor; node scripts\serve.cjs 8090` · `Set-Location client; npx vite --port 5173 --host 127.0.0.1`. App: http://127.0.0.1:5173. Verification codes appear in `server\var\outbox`.
3. **Attestor must be registered in the dev DB:** `php bin\register_attestor.php ..\attestor\dist\manifest.json` (a registry row for a version cannot change hash; delete the dev row if the module was rebuilt).
4. **One-command check:** `$env:MRA_PHP="C:\xampp\php\php.exe"; $env:MRA_PHP_FLAGS="-d extension=sodium"; $env:OPENSSL_CONF="C:\xampp\apache\conf\openssl.cnf"; node e2e\full-stack.cjs` (starts its own servers).
5. **Tests:** `server: vendor\bin\phpunit` (needs the DB and `OPENSSL_CONF` set for key generation tests, and `MRA_TEST_PHP_FLAGS="-d extension=sodium"`); `client: npm test`; `attestor: npm test` (real Chromium via Playwright).
6. `server/.env` holds the encryption key, blind-index pepper and Ed25519 seed. **Never commit it; never print it.** `DB_ADMIN_USER=root` is set for the grant tests.

## 8. Git conventions (follow exactly)

- Repo `C:\Users\aryan\WT_CP\mra`, branch `main`, local only. One branch per milestone `feat/<id>-<slug>`, committed then merged `--no-ff` into main.
- **Authors:** `aryanketkar-15` (A) owns protocol/digest/verifier/research (phases 2,3,4.1-4.3,5,6); `chetanagrawal721` (C) owns accounts/data/product/testing (0,1,4.4,7). Set author AND committer via `GIT_AUTHOR_NAME/EMAIL` and `GIT_COMMITTER_*` with email `<username>@users.noreply.github.com`. The merge commit is authored by the *other* person (simulating review).
- **No `Co-Authored-By` trailer and no mention of Claude/Anthropic in any commit message.** The user explicitly required this; it overrides any default.
- Never commit `.env`, `node_modules`, `vendor`, `*.pem`, `*.key`, `dist/` (except tagged attestor release), `server/var/`. `.gitattributes` forces LF; line-ending drift breaks hash determinism.
- Tag `attestor-v1.0.0` exists locally.

## 9. Environment gotchas that cost time

1. **Tool input mangling:** in this agent environment `\uXXXX` and `\\` in Write/Bash inputs are decoded before reaching files, and Bash commands longer than about 200 lines fail to parse. Use a placeholder (e.g. `§`) and a short Python post-process using `chr(92)`, keep commands short, verify with `cat -A`. PHP `\u{...}` survives. Prettier rewrites `\u` escapes in JSON/TS fixtures into raw characters: fixtures are in `.prettierignore`.
2. **Windows:** `escapeshellarg` mangles `%` (pass argument arrays to `proc_open`); OpenSSL key generation needs `OPENSSL_CONF`; PowerShell 5.1 has no `&&`.
3. **Chromium Local Network Access** blocks a route-mocked page from reaching loopback servers; tests use real local http servers.
4. `git` helper: when a commit has nothing to commit the helper script leaves you on an empty branch; return to `main` and delete it.
5. Playwright browsers: bundled Chromium only (CDN blocked); Chrome, Edge and stock Firefox are installed on the machine and Firefox is driven over WebDriver BiDi in `research/harness/cross-browser-informal.cjs`.
6. The user ran the demo and hit two real bugs that tests had hidden (registration did not request an OTP; stale CSRF token after verification). Both are fixed. Lesson: tests that supply a step the UI does not perform give false confidence; prefer driving the real UI.

## 10. Where to look for a specific question

- Why was X chosen / rejected: `PROJECT_LOG.md` section 3 (D-01..D-17) and sections 10-13 (D-18..D-35).
- Thresholds and their justification: `PROJECT_LOG.md` 12.2. Normalisation order: 12.1.
- Measurements for Phase 6: 12.3 (35 ms for 500 nodes) and 13.2 (proof timing, race results).
- What is unverified: this file section 6, `PROJECT_LOG.md` 12.5 and 13.5, and ☐/◐ rows in `docs/BUILD_PLAYBOOK.md`.

## 11. Repository, remote and in-flight work (updated 2026-10-16)

- **Remote:** https://github.com/aryanketkar-15/multirender-wtcp.git. `main` holds only finished, tested work. All other branches and the tags `attestor-v1.0.0` and `attestor-v1.1.0` are pushed too. GitHub Actions has never run the CI workflow; branch protection and other settings are not configured.
- **Unfinished UI work:** branch `wip/phase7-ui` (design tokens, EmptyState, ErrorBoundary, Skeleton, icons, stylesheet and layout changes). Not merged: `client/tests/App.test.tsx` fails to parse with it. The UI refinement had just begun: the dev stack was started and a screenshot script drafted, but no refinement was made. The verifier dashboard (`/verifier`) needs the verifier HTTP server (`verifier/src/server.ts`, port 8095), which has to be bundled with esbuild to run because the package has no `tsx`.
- **Attestor:** current release 1.1.0 (ships the region representation); 1.0.0 stays in `attestor/dist/` because packs name the build that made them.
- **Fixtures:** `verifier/fixtures/real/` holds real packs from the live stack (honest, and page altered after load, for 1.1.0 and 1.0.0).

## 12. State after the 2026-10-20 review (read PROJECT_LOG section 26)

- Branch `feat/professional-ui-redesign` holds the finished UI (Phase 7). All suites pass with nothing skipped; the UI was checked with axe-core (0 violations) and the taste-skill linter (0 failures). `docs/test-report.md` was rewritten from measurements; do not restore the 2026-10-18 figures.
- A real concurrent load test (`server/bin/load_attest.php`) found and fixed a log-locking bug; `research/results/load-test.json` is its real output.
- `scripts/dev-backend.cjs` is a mock API, not the MRA server.
- Not re-run by me: the milestone 7.4 demo timings, three consecutive runs, recording, deployment from a clean machine.
