# Handoff: everything a new agent needs

Read this first. It is written for an AI agent or developer joining the project cold. Written 2026-10-10.

## 1. The project in one paragraph

**PS-3 Mutual Render Attestation** (Group TY-A9, VIT Pune, Web Technologies, faculty Prof. Vidya Gaikwad). When a user clicks "I agree", the company's record of what the screen showed is one-sided. Our system produces evidence neither side can forge alone: (1) before interaction the server signs a **commitment** to a sealed, hashed render bundle (Ed25519); (2) at the moment of the click the user's browser computes a **semantic digest** of the real page (via an independently hosted **Attestor Module**) and signs it with a non-extractable ECDSA P-256 key; (3) both go into an **append-only RFC 6962 Merkle log** whose signed heads are published externally; (4) an **independent verifier** (NOT BUILT YET) re-renders the committed bundle and compares digests. Reasons, rejected alternatives and prior art are in `PROJECT_LOG.md` (decisions D-01..D-35).

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

## 5. Current state (honest)

| Playbook phase | State |
|---|---|
| 0 Setup and baseline | Done (CI config written, never run on GitHub) |
| 1 Accounts, validation, security | Done |
| 2 Sealed bundle and commitment | Done |
| 3 Attestor and semantic digest | Done; thresholds provisional |
| 4 Client attestation and Merkle log | Done; two claims not met (below) |
| **5 Evidence pack and independent verifier** | **NOT STARTED** |
| 6 Measurement and research harness | Not started (informal seed only) |
| 7 Product polish, accessibility, report, demo | Not started |

Latest counts: 415 PHP tests, 159 client tests, 234 attestor tests, verifier 2 smoke tests, plus `e2e/full-stack.cjs` 20/20 as the restricted DB account. ~55 local commits on `main`, **nothing pushed** (no remote exists).

## 6. Things that are NOT done or NOT proven (do not claim them)

- No independent verifier, no evidence pack: the headline verdict ("server showed X but committed Y") cannot be demonstrated end to end yet.
- **O-08:** the context digest covers the application's own chrome (header with the user's name), so a bundle-only replay cannot reproduce it. Must be decided before Phase 5.
- **O-12/O-13:** the server sees only the client's digests; region policy is checked on the committed bundle only.
- **O-02:** no real `mra-sth-witness` repo or schedule; `GitWitness` + `bin/publish_sth.php` tested only against a local bare git remote.
- WebAuthn tier not built. Real SMTP delivery never exercised (dev uses a file outbox in `server/var/outbox`). CI never run. Second-machine checks (T2.1.1 bundle hash, T3.5.1 attestor hash, O-09) not done.
- **O-03:** the 20-mutation suite must be fixed BEFORE thresholds are finalised (thresholds are provisional).
- **O-01:** ask Prof. Gaikwad whether syllabus units III/IV must be demonstrated; if yes the verifier is Spring Boot, not Node. Decide before Phase 5.
- Cross-browser: 30/30 cells agree across Chromium, Chrome, Edge, Firefox on one OS, small sample, no Safari.
- Attestor host is a separate origin on the same machine, not independently operated.
- Known findings (PROJECT_LOG 12.3): zero-width injection leaves the semantic digest unchanged (caught by the bundle hash); one large button makes siblings read `suppressed`; pointer-events:none overlays are invisible to occlusion; `aria-hidden` visible content is skipped.

## 6a. Phase 5 plan (next work), from the playbook

5.1 evidence pack export (zip, self-contained, only the session subject may download; `/api/pack/{id}` is already behind ownership authorization with stubs); 5.2 verifier skeleton and cheap checks (signatures, hashes, Merkle proofs, registry, twelve verdict paths); 5.3 headless re-render under the recorded env profile with Playwright and digest comparison, node-level diff; 5.4 verifier UI. Reuse: `MerkleProof` (PHP) and the JS verifier code in `e2e/full-stack.cjs`; the attestor bundle at `attestor/dist` computes digests inside Playwright. Resolve O-08 first.

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
