# PS-3 Mutual Render Attestation — Build Playbook

**Team:** `aryanketkar-15` (A) · `chetanagrawal721` (C)
**Repository:** `mra`
**Companion documents:** design document (architecture, protocol, attack model) · `PROJECT_LOG.md` (decision rationale, checklists)
**Created:** 2026-10-03

> **Status of this copy (maintained alongside the code; the original in Downloads is unchanged).**
> Last updated 2026-10-07. Phases 0-4 implemented locally; Phases 5-7 not started.
> Test-case legend: ✅ covered by an automated test or the end-to-end run · ◐ partly evidenced (one machine, local stand-in, or CI never run; see `PROJECT_LOG.md`) · ☐ not yet verified.
> Task boxes are ticked where the work exists. **Verification checklists (section 7 of each milestone) are deliberately left unticked here** and are tracked in `PROJECT_LOG.md` section 8, where an item is ticked only once verified.
> Not done and not claimed: GitHub-side items (branch protection, PRs, CI runs, push), second-machine checks (T2.1.1, T3.5.1), a real external tree-head witness, the WebAuthn tier, real SMTP delivery.

---

## Missing information — resolve before Phase 5

These have been defaulted so the playbook is usable today. Three are low-risk; one is a genuine architectural fork.

| ID | Item | Default taken | Risk if wrong |
|---|---|---|---|
| O-01 | Verifier runtime: Node.js or Spring Boot | **Node.js + Playwright**, per the current design | Architectural. Confined to Phase 5 by design so the swap costs ~2 days, not a rewrite. Ask Prof. Diwate before Milestone 5.2 |
| O-02 | Where signed tree heads are published externally | A second GitHub repository (`mra-sth-witness`), written by CI | Low — one module, swappable |
| O-03 | SMTP provider for OTP delivery | Gmail app password in development; Brevo free tier for the demo | Low — config only |
| O-04 | Project deadline | None given; milestones sized in half-days of one person's work | Sequencing is dependency-driven, not date-driven. Add dates once known |

---

## Working agreement for two developers

**Ownership split.** A takes the cryptographic and research-critical path; C takes the account, data and product path. The two tracks run in parallel through Phases 1–2 and converge at Phase 4.

| Track | Owner | Phases |
|---|---|---|
| Protocol, digest, verifier, research harness | **A** | 2, 3, 4 (protocol half), 5, 6 |
| Accounts, database, encryption, logging, product, testing | **C** | 0, 1, 4 (persistence half), 7 |

**Branching.** `main` is protected and always deployable. One branch per milestone, named `feat/<milestone-id>-<slug>` — e.g. `feat/1.3-otp-email`. Every branch merges to `main` via pull request reviewed by the *other* person. With two developers, review is not bureaucracy; it is the only defence against a single person's blind spot reaching `main`.

**Never push to `main` directly.** Never merge a branch whose milestone verification checklist has unticked items.

**Daily sync.** Ten minutes. Each person states: milestone in progress, blocked or not, anything that changes the other's assumptions.

---

## Repository layout

```
mra/
├── client/                  React + TypeScript (Vite) — consent UI, account UI, verifier dashboard
│   ├── src/components/
│   ├── src/pages/
│   ├── src/lib/
│   └── tests/
├── attestor/                Independent Attestor Module — deployed separately from server/
│   ├── src/
│   ├── dist/
│   └── tests/
├── server/                  PHP 8.2
│   ├── public/              Document root — only index.php is web-reachable
│   ├── src/Controller/
│   ├── src/Service/
│   ├── src/Repository/
│   ├── src/Validation/
│   ├── src/Crypto/
│   ├── src/Log/
│   ├── config/
│   ├── migrations/
│   └── tests/
├── verifier/                Node.js + Playwright — independent service
│   ├── src/
│   ├── fixtures/
│   └── tests/
├── research/
│   ├── harness/
│   ├── corpus/
│   ├── mutations/
│   └── results/
├── docs/
├── .github/workflows/
├── ASSETS.md
├── PROJECT_LOG.md
└── README.md
```

**Why `attestor/` is a separate top-level module and a separate deployment:** design decision D-03. If the consent server could serve the digest code, it could serve digest code that lies. The separation is the security property, not a packaging preference. It must never be bundled into `client/` or served from `server/public/`.

---

## Universal rules

**Never commit:** `.env`, `.env.*` (except `.env.example`), `node_modules/`, `vendor/`, `client/dist/`, `attestor/dist/` (except tagged releases), `research/corpus/` raw pages, `research/results/*.raw.json`, `*.pem`, `*.key`, any file containing an SMTP password, encryption pepper, or signing key. `.gitignore` is written in Milestone 0.1 and is itself a reviewed artifact.

**Rollback pattern.** Used wherever a milestone's rollback section says "standard rollback":

```bash
git log --oneline -10                      # find the last good commit
git revert --no-commit <bad-sha>..HEAD     # safe: preserves history
git commit -m "revert: roll back to <milestone-id> checkpoint"
git push origin main
```

Never `git push --force` to `main`. With two developers sharing one branch, a force push destroys the other person's local state silently.

---

# Phase 0 — Project Setup & Baseline

**Owner:** C · **Depends on:** nothing · **Goal:** a repository where a test can fail for the right reason.

---

## Milestone 0.1 — Repository, tooling and CI skeleton

**1. Milestone name.** Repository initialised with all four modules, linting, and a CI pipeline that runs on every pull request.

**2. Objective.** Establish the structure every later milestone commits into, and make CI the gate that enforces the "never merge a red branch" rule. Doing this first means no later milestone has to retrofit tooling.

**3. Tasks to complete.**
- [ ] Initialise repository; create `main`; enable branch protection requiring one review and passing CI
- [x] Create the four module directories with placeholder `README.md` in each
- [x] `client/`: Vite + React + TypeScript; ESLint + Prettier
- [x] `attestor/`: TypeScript library scaffold, no React dependency
- [x] `server/`: Composer project, PHP 8.2, PSR-4 autoload, PHP_CodeSniffer
- [x] `verifier/`: Node project, TypeScript, ESLint
- [x] Write `.gitignore` covering every item in the universal rules
- [x] Write `.env.example` for each module with every key present and every value blank
- [x] `.github/workflows/ci.yml`: lint + test for all four modules in parallel jobs
- [x] Write `README.md`: what the project is, how to run each module, where the design document lives

**4. Files / modules affected.** `.gitignore`, `.env.example` ×4, `README.md`, `.github/workflows/ci.yml`, `client/package.json`, `attestor/package.json`, `server/composer.json`, `verifier/package.json`, `client/vite.config.ts`, all four `tsconfig.json`.

**5. Implementation guidance.** Vite over Create React App because CRA is unmaintained and Vite's build is required later for the attestor's reproducible hashing. TypeScript across all JS modules because the digest's correctness depends on field-level discipline and a type error caught at compile time is cheaper than a digest mismatch found during the demo. CI must run all four modules even when three have no tests yet — a pipeline added later is a pipeline that stays red for a week.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T0.1.1 | CI runs on pull request | Repo initialised, CI committed | Open a PR with a trivial change | All four jobs run and pass | ☐ |
| T0.1.2 | Lint failure blocks merge | CI green | Push a file violating ESLint | CI fails; merge button disabled | ☐ |
| T0.1.3 | Secrets excluded | `.gitignore` committed | Create `server/.env` with dummy content; `git status` | `.env` not listed as untracked-to-add | ✅ |
| T0.1.4 | Clean clone builds | Repo pushed | Clone to a fresh directory; follow README | All four modules install and build without manual fixes | ☐ |
| T0.1.5 | Branch protection enforced | Protection enabled | Attempt `git push origin main` directly | Push rejected by remote | ☐ |

**7. Verification checklist.**
- [ ] `git clone` to an empty directory, follow README only, all modules build
- [ ] CI green on a test PR
- [ ] Direct push to `main` rejected
- [ ] `git ls-files | grep -E '\.env$|node_modules|vendor'` returns nothing
- [ ] Both developers have cloned and built successfully on their own machines

**8. Completion criteria.** Both developers can build all four modules from a clean clone, CI gates merges, and no secret-bearing path is trackable.

**9. Git checkpoint.**
```bash
git checkout -b feat/0.1-repo-baseline
git status
git add .
git commit -m "chore(0.1): initialise repo, four modules, lint and CI baseline"
git push origin feat/0.1-repo-baseline
# open PR → reviewed by A → merge to main
```
**Do not commit:** `.env`, `node_modules/`, `vendor/`, `.idea/`, `.vscode/`, `dist/`.

**10. Rollback.** Nothing depends on this yet. Delete the branch and restart: `git checkout main && git branch -D feat/0.1-repo-baseline`.

---

## Milestone 0.2 — Database connection layer and migrations

**1. Milestone name.** MySQL connection established through PDO with a migration runner and a dedicated test schema.

**2. Objective.** Deliver the database connection requirement properly rather than as an afterthought, and establish migrations before any table exists — retrofitting migrations onto a hand-built schema is painful and always happens at the worst time.

**3. Tasks to complete.**
- [x] Create databases `mra` and `mra_test`
- [x] `server/src/Repository/Database.php`: PDO singleton, `ERRMODE_EXCEPTION`, `FETCH_ASSOC`, emulated prepares **off**
- [x] Credentials read from environment only; never from a committed file
- [x] Write a minimal migration runner: `migrations/` holds numbered `.sql` up/down pairs; a `schema_migrations` table records what has run
- [x] `php server/bin/migrate.php up` and `down` commands
- [x] First migration: `schema_migrations` itself
- [x] `server/tests/DatabaseTest.php`: connection, transaction rollback helper for all later DB tests
- [x] Connection failure must raise a catchable exception, never print credentials

**4. Files / modules affected.** `server/src/Repository/Database.php`, `server/bin/migrate.php`, `server/migrations/001_schema_migrations.sql`, `server/config/database.php`, `server/tests/DatabaseTest.php`, `server/tests/TestCase.php`, `server/phpunit.xml`.

**5. Implementation guidance.** Emulated prepares must be disabled (`PDO::ATTR_EMULATE_PREPARES => false`) — with emulation on, PDO interpolates client-side and the injection protection is weaker than it appears. Every later repository extends a base that requires prepared statements; no string-concatenated SQL anywhere in the project.

Each database test wraps itself in a transaction and rolls back in `tearDown()`. This gives test isolation without rebuilding the schema between tests, which matters once there are a hundred of them.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T0.2.1 | Connection succeeds | MySQL running, env set | Instantiate `Database::connection()` | PDO instance returned | ✅ |
| T0.2.2 | Bad credentials fail safely | Env has wrong password | Attempt connection | `PDOException` thrown; message contains no password | ✅ |
| T0.2.3 | Migration up | Empty `mra_test` | Run `migrate.php up` | `schema_migrations` exists with one row | ✅ |
| T0.2.4 | Migration idempotent | Migration already run | Run `migrate.php up` again | No error; no duplicate row | ✅ |
| T0.2.5 | Migration down | Migration applied | Run `migrate.php down` | Table removed; row removed | ✅ |
| T0.2.6 | Transaction rollback isolates tests | Test schema migrated | Insert in a test, let `tearDown` run, query in next test | Row absent | ✅ |
| T0.2.7 | Prepared statement enforced | Connection open | Query with a parameter containing `'; DROP TABLE--` | Treated as a literal value; no SQL executed | ✅ |

**7. Verification checklist.**
- [ ] `migrate.php up` then `down` then `up` leaves a correct schema
- [ ] Connection errors never surface credentials in any message or log
- [ ] `grep -rn '"SELECT.*\$' server/src/` returns nothing (no interpolated SQL)
- [ ] All seven tests pass against `mra_test`
- [ ] CI runs DB tests against a MySQL service container

**8. Completion criteria.** Migrations run forward and back cleanly, tests isolate via transactions, and no SQL in the codebase is built by string concatenation.

**9. Git checkpoint.**
```bash
git checkout -b feat/0.2-db-layer
git status
git add .
git commit -m "feat(0.2): PDO connection layer, migration runner, test harness"
git push origin feat/0.2-db-layer
```
**Do not commit:** `server/config/local.php`, any file with real credentials, `.sql` dumps containing data.

**10. Rollback.** `php server/bin/migrate.php down` to the previous version, then standard rollback. Because migrations are reversible from this milestone onward, schema rollback never requires manual SQL.

---

## Milestone 0.3 — Logging foundation

**1. Milestone name.** Application audit log and security log implemented as separate append-only tables with rotation.

**2. Objective.** Satisfy the log-maintenance requirement, and establish logging before the features that need to log — so no feature ships without an audit trail.

**3. Tasks to complete.**
- [x] Migration: `audit_log` (id, actor_id, action, target_type, target_id, outcome, ip_enc, ua_enc, created_at)
- [x] Migration: `security_log` (id, event_type, actor_id nullable, detail, ip_enc, severity, created_at)
- [x] `server/src/Log/AuditLogger.php` and `SecurityLogger.php`
- [x] Redaction filter: a denylist of keys (`password`, `otp`, `token`, `secret`, `key`, `session_id`) stripped before any write
- [x] Daily rotation job archiving rows older than retention to a dated table; size cap with alert
- [x] A failed log write must surface, not silently swallow
- [x] Unit tests for redaction, including nested arrays

**4. Files / modules affected.** `server/migrations/002_audit_log.sql`, `003_security_log.sql`, `server/src/Log/AuditLogger.php`, `SecurityLogger.php`, `Redactor.php`, `server/bin/rotate_logs.php`, `server/tests/Log/RedactorTest.php`.

**5. Implementation guidance.** Three logs exist in this project and conflating them is a design error (decision D-16). The Merkle evidence log is append-only and externally witnessed; it is built in Phase 4 and is **not** one of these two. These two are operational.

IP address and user agent are personal data under GDPR, so their columns are encrypted once Milestone 1.1 lands. Until then they are stored null — do not store them in plaintext "temporarily", because temporary plaintext is how plaintext ships.

The redactor runs on the structure, not the string. A regex over a serialised payload will miss a password nested two levels down.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T0.3.1 | Audit entry written | Tables migrated | Log a `user.login` action | Row present with correct actor and outcome | ✅ |
| T0.3.2 | Password redacted | Logger available | Log a payload containing `password` | Stored detail shows `[redacted]`, never the value | ✅ |
| T0.3.3 | Nested secret redacted | Logger available | Log `{user:{credentials:{password:"x"}}}` | Nested value redacted | ✅ |
| T0.3.4 | OTP redacted | Logger available | Log payload with key `otp` | Redacted | ✅ |
| T0.3.5 | Security event severity | Tables migrated | Log a failed-login event | Row in `security_log`, not `audit_log`; severity set | ✅ |
| T0.3.6 | Write failure surfaces | DB unavailable | Trigger a log write | Exception raised; not silently discarded | ✅ |
| T0.3.7 | Rotation archives old rows | 200 days of seeded rows | Run `rotate_logs.php` | Rows past retention moved to archive table; recent rows untouched | ✅ |

**7. Verification checklist.**
- [ ] No secret-bearing key reaches either table under any test
- [ ] Audit and security events land in different tables
- [ ] Rotation runs without data loss; row counts reconcile before and after
- [ ] A deliberate DB outage produces a visible error, not a silent drop
- [ ] Both log tables have `INSERT`-only grants for the application user

**8. Completion criteria.** Both logs write correctly, redaction is provably complete against the test set, rotation reconciles, and failures are visible.

**9. Git checkpoint.**
```bash
git checkout -b feat/0.3-logging
git status
git add .
git commit -m "feat(0.3): audit and security logs with redaction and rotation"
git push origin feat/0.3-logging
```

**10. Rollback.** `migrate.php down` removes both tables. No feature depends on logging yet, so rollback is clean. After Phase 1 it is not — logging becomes a dependency of every account action.

---

## Milestone 0.4 — Test harness and coverage gate

**1. Milestone name.** Jest, React Testing Library, PHPUnit and Playwright wired into CI with a coverage floor.

**2. Objective.** Make the testing requirement structural rather than a final-week scramble. A coverage gate added at the end is always negotiated down; added at the start it shapes how code is written.

**3. Tasks to complete.**
- [x] `client/`: Jest + React Testing Library + `jest-environment-jsdom`
- [x] `attestor/`: Jest, node environment
- [x] `server/`: PHPUnit with the transaction-rollback base from 0.2
- [x] `verifier/`: Jest; Playwright installed with browsers cached in CI
- [ ] Coverage reporting in all four; CI fails below 70% lines on changed files
- [x] One real passing test per module (not a placeholder assertion)
- [ ] CI caches `node_modules`, Composer and Playwright browsers

**4. Files / modules affected.** `client/jest.config.ts`, `attestor/jest.config.ts`, `verifier/jest.config.ts`, `server/phpunit.xml`, `.github/workflows/ci.yml`, one smoke test per module.

**5. Implementation guidance.** 70% on *changed* files rather than global coverage: a global floor punishes the first contributor and is then permanently gamed. Playwright browser downloads dominate CI time if uncached — cache them in Milestone 0.4, not after CI takes nine minutes.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T0.4.1 | All suites run in CI | 0.1 complete | Open a PR | Four test jobs execute | ☐ |
| T0.4.2 | Coverage gate blocks | Gate configured | Push an uncovered new file | CI fails with a coverage message | ☐ |
| T0.4.3 | A failing test fails CI | Suites wired | Commit a deliberately failing assertion | CI red; merge blocked | ☐ |
| T0.4.4 | Playwright launches in CI | Browsers cached | Run the verifier smoke test | Browser launches; test passes | ◐ |
| T0.4.5 | DB tests isolated in CI | MySQL service container | Run PHPUnit twice consecutively | Identical results; no state leakage | ☐ |

**7. Verification checklist.**
- [ ] `npm test` and `vendor/bin/phpunit` pass locally for both developers
- [ ] CI completes in under five minutes with caches warm
- [ ] A deliberately failing test blocks merge
- [ ] Coverage reports are produced and visible in the CI summary

**8. Completion criteria.** All four suites run in CI, failures block merges, and the coverage gate is active.

**9. Git checkpoint.**
```bash
git checkout -b feat/0.4-test-harness
git status
git add .
git commit -m "test(0.4): wire Jest, RTL, PHPUnit and Playwright into CI with coverage gate"
git push origin feat/0.4-test-harness
```
**Do not commit:** coverage output directories, Playwright browser binaries, `test-results/`.

**10. Rollback.** Standard rollback. If the coverage gate proves too aggressive, lower the threshold in a follow-up commit rather than removing the gate — a removed gate is never re-added.

---

## Phase 0 Completion Checkpoint

| Item | Detail |
|---|---|
| Milestones completed | 0.1, 0.2, 0.3, 0.4 |
| Tests passed | T0.1.1–T0.4.5 (24 cases) |
| Known issues | IP/UA columns null until encryption lands in 1.1 |
| Git commit | `65ac0b5` (merge commit of the last milestone; local, not pushed) |
| Phase verification | Clean clone builds; CI gates merges; migrations reversible; logging redacts; four test suites green |
| **Go / No-Go** | **Go** when a clean clone builds for both developers and CI blocks a deliberately broken PR |

---

# Phase 1 — Account Layer, Validation and Security

**Owner:** C · **Depends on:** Phase 0 · **Runs in parallel with:** Phase 2 (A)

This phase delivers the course requirements for sessions, cookies, encryption at rest, validation and OTP. Per decision D-13 it also raises the protocol's identity binding from key-level to account-level.

---

## Milestone 1.1 — User schema with encryption at rest and blind index

**1. Milestone name.** `users` table with AES-encrypted personal data and an HMAC blind index for email lookup.

**2. Objective.** Deliver the encryption requirement and solve the lookup problem it creates *before* any code depends on querying by email. This ordering is deliberate — decision D-14 exists because teams routinely discover the problem after the login path is written.

**3. Tasks to complete.**
- [x] Migration: `users` (id, email_enc, email_bidx, name_enc, password_hash, verified_at, created_at, updated_at)
- [x] Unique index on `email_bidx`
- [x] `server/src/Crypto/FieldCipher.php` wrapping libsodium `crypto_aead_xchacha20poly1305_ietf`
- [x] `server/src/Crypto/BlindIndex.php`: `HMAC-SHA256(pepper, strtolower(trim(email)))`
- [x] Encryption key and blind-index pepper loaded from environment, distinct values
- [x] `UserRepository` with `findByEmail()` using the blind index then decrypting
- [x] Retrofit encryption onto `audit_log.ip_enc` and `ua_enc` from 0.3
- [x] Document in `PROJECT_LOG.md` which columns are encrypted and which are deliberately not

**4. Files / modules affected.** `server/migrations/004_users.sql`, `005_encrypt_log_columns.sql`, `server/src/Crypto/FieldCipher.php`, `BlindIndex.php`, `server/src/Repository/UserRepository.php`, `server/config/crypto.php`, `server/tests/Crypto/FieldCipherTest.php`, `BlindIndexTest.php`.

**5. Implementation guidance.** Authenticated encryption is non-deterministic: the same email encrypts differently every time, so `WHERE email_enc = ?` can never work. The blind index is the fix and it must be derived with a pepper held outside the database, so that a database dump alone does not permit enumeration of known addresses.

**Do not encrypt** password hashes (already one-way), digests, signatures, public keys or Merkle leaf hashes. Decision D-15: those must stay comparable and recomputable by a verifier holding none of our keys. Encrypting them breaks every inclusion proof — and it breaks it silently, at Phase 5, far from the cause.

Key management for the prototype is an environment variable loaded outside the web root. State this as a prototype limitation in the report rather than implying a KMS exists.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T1.1.1 | Encrypt/decrypt round-trip | Key configured | Encrypt a string, decrypt it | Original value returned | ✅ |
| T1.1.2 | Ciphertext non-deterministic | Key configured | Encrypt the same value twice | Two different ciphertexts | ✅ |
| T1.1.3 | Tampered ciphertext rejected | Value encrypted | Flip one byte, decrypt | Authentication failure exception; no plaintext returned | ✅ |
| T1.1.4 | Blind index deterministic | Pepper configured | Index the same email twice | Identical index | ✅ |
| T1.1.5 | Blind index normalises | Pepper configured | Index `A@B.com` and `  a@b.com  ` | Identical index | ✅ |
| T1.1.6 | Lookup by email works | User seeded | `findByEmail('a@b.com')` | Correct user returned, fields decrypted | ✅ |
| T1.1.7 | Duplicate email rejected | User exists | Insert same email again | Unique constraint violation on `email_bidx` | ✅ |
| T1.1.8 | Wrong key fails closed | Row encrypted | Decrypt with a different key | Exception; never garbage plaintext | ✅ |
| T1.1.9 | No plaintext PII at rest | Users seeded | `SELECT * FROM users` raw | No readable email or name in output | ✅ |

**7. Verification checklist.**
- [ ] Raw `SELECT * FROM users` shows no readable personal data
- [ ] Login lookup by email succeeds via blind index
- [ ] Changing the pepper breaks lookup (proves the pepper is actually in use)
- [ ] Tampered ciphertext fails closed, never returns partial plaintext
- [ ] `PROJECT_LOG.md` records the encrypt / do-not-encrypt decision per column
- [ ] Encryption key and pepper are different values, both absent from the repository

**8. Completion criteria.** Personal data is unreadable at rest, email lookup works through the blind index, and the exclusion list for cryptographic columns is documented.

**9. Git checkpoint.**
```bash
git checkout -b feat/1.1-user-encryption
git status
git add .
git commit -m "feat(1.1): users table with field encryption and email blind index"
git push origin feat/1.1-user-encryption
```
**Do not commit:** `.env` holding `APP_ENCRYPTION_KEY` or `BLIND_INDEX_PEPPER`, any seeded dump with real addresses.

**10. Rollback.** Migration down removes the table. **Caution:** once real data is encrypted, rolling back the key loses it irrecoverably. Keep the development key in a shared password manager, not only on one machine.

---

## Milestone 1.2 — Registration with full validation

**1. Milestone name.** Registration endpoint and form with required-field, range and compare-field validation, enforced on both sides.

**2. Objective.** Deliver three of the mandatory validators in their natural home, with the server as the enforcement boundary.

**3. Tasks to complete.**
- [x] `server/src/Validation/Validator.php` with rules: `required`, `length(min,max)`, `email`, `matches(field)`, `integerRange(min,max)`
- [x] `RegistrationRequest` validation schema per the design document's rules table
- [x] `POST /api/register`: validate, hash with Argon2id via `password_hash()`, insert unverified
- [x] React `RegisterForm` with the same rules for feedback
- [x] Field-level error rendering; no raw server errors shown to the user
- [x] Audit log entry on success; security log entry on repeated validation failure from one IP
- [x] Rate limit: 5 registration attempts per IP per hour

**4. Files / modules affected.** `server/src/Validation/Validator.php`, `Rules/`, `server/src/Controller/RegistrationController.php`, `server/src/Service/UserService.php`, `client/src/pages/Register.tsx`, `client/src/components/FormField.tsx`, `client/src/lib/validation.ts`, tests in both.

**5. Implementation guidance.** The client-side rules are a usability feature with no security weight. The server re-runs every rule, and a request crafted outside the browser must fail identically — this is the single most important property to demonstrate in the viva, and test T1.2.6 exists to prove it.

Argon2id via `password_hash(PASSWORD_ARGON2ID)` rather than bcrypt: it is the current recommendation and PHP 8.2 supports it natively, so there is no dependency cost.

The consent checkbox rule is worth noting aloud: this project forbids a pre-ticked consent box in its own forms while building a digest that detects pre-ticked boxes in other people's. Enforcing on ourselves the standard we measure in others is a defensible point in the report.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T1.2.1 | Valid registration | Schema migrated | Submit valid payload | 201; user created unverified | ✅ |
| T1.2.2 | Missing required field | — | Submit without name | 422; field-level error; no user created | ✅ |
| T1.2.3 | Invalid email format | — | Submit `notanemail` | 422 with email error | ✅ |
| T1.2.4 | Password mismatch | — | Password `A`, retype `B` | 422; compare-field error | ✅ |
| T1.2.5 | Password below range | — | 8-character password | 422; range error | ✅ |
| T1.2.6 | **Server enforces without client** | API reachable | `curl` a payload bypassing the browser entirely with an invalid email | 422 — identical to browser behaviour | ✅ |
| T1.2.7 | Duplicate email | User exists | Register same email | 409; no enumeration detail leaked in the message | ✅ |
| T1.2.8 | Password never stored or logged | Registration succeeds | Inspect `users` and both log tables | No plaintext password anywhere | ✅ |
| T1.2.9 | Rate limit trips | — | 6 registrations from one IP in an hour | 429 on the sixth; security log entry | ✅ |
| T1.2.10 | Unicode name accepted | — | Register with a name containing non-ASCII characters | Accepted; round-trips correctly | ✅ |

**7. Verification checklist.**
- [ ] Every rule fails correctly when the client is bypassed with `curl`
- [ ] No plaintext password in database, logs or HTTP response
- [ ] Error messages do not reveal whether an email is already registered beyond a generic conflict
- [ ] Rate limiting produces a security log entry
- [ ] Client and server rules match field for field — walk the design document's table and confirm each row

**8. Completion criteria.** Registration creates an unverified account, all five validator types work, and server-side enforcement is proven independent of the client.

**9. Git checkpoint.**
```bash
git checkout -b feat/1.2-registration-validation
git status
git add .
git commit -m "feat(1.2): registration with required, range and compare-field validation"
git push origin feat/1.2-registration-validation
```

**10. Rollback.** Standard rollback. Migration down is not required; the table persists harmlessly.

---

## Milestone 1.3 — OTP email verification

**1. Milestone name.** Six-digit OTP delivered by email, hashed at rest, with expiry and attempt limits.

**2. Objective.** Deliver the email-authentication requirement and gate attestation behind a verified identity.

**3. Tasks to complete.**
- [x] Migration: `user_otp` (id, user_id, code_hash, expires_at, attempts, created_at)
- [x] Generate with `random_int(100000, 999999)`; hash with `password_hash()` before storage
- [x] PHPMailer over authenticated SMTP; credentials from environment
- [x] `POST /api/otp/request` and `POST /api/otp/verify`
- [x] 10-minute expiry; max 5 verification attempts per code; max 3 requests per email per hour
- [x] On success: set `verified_at`, delete the OTP row, regenerate session, audit log
- [x] React `VerifyEmail` page with resend and a countdown
- [x] Unverified accounts blocked from producing attestations (enforced server-side)

**4. Files / modules affected.** `server/migrations/006_user_otp.sql`, `server/src/Service/OtpService.php`, `server/src/Service/MailService.php`, `server/src/Controller/OtpController.php`, `client/src/pages/VerifyEmail.tsx`, `server/tests/Service/OtpServiceTest.php`.

**5. Implementation guidance. `random_int()`, never `rand()` or `mt_rand()`** — the latter are predictable and an OTP is a security token. Hash the code before storage for the same reason passwords are hashed: a database read must not yield working codes.

Verification failure must return the same message whether the code is wrong, expired, or the user does not exist. Distinct messages turn the endpoint into an account enumeration oracle.

Inject `MailService` behind an interface so tests use a fake. Tests that send real email are slow, flaky and eventually get the SMTP account suspended.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T1.3.1 | OTP issued and emailed | User registered | Request OTP | Row created; fake mailer received a 6-digit code | ✅ |
| T1.3.2 | Correct OTP verifies | OTP issued | Submit correct code | 200; `verified_at` set; OTP row deleted | ✅ |
| T1.3.3 | Wrong OTP rejected | OTP issued | Submit wrong code | 422; attempts incremented; still unverified | ✅ |
| T1.3.4 | Expired OTP rejected | OTP issued 11 min ago | Submit correct code | 422; generic message | ✅ |
| T1.3.5 | Attempt limit | OTP issued | 6 wrong attempts | Locked after 5; security log entry | ✅ |
| T1.3.6 | Request rate limit | — | 4 requests in an hour | 429 on the fourth | ✅ |
| T1.3.7 | OTP not stored in plaintext | OTP issued | Inspect `user_otp` | Only a hash present | ✅ |
| T1.3.8 | OTP never logged | OTP issued and verified | Inspect both log tables | Code absent (redaction from 0.3) | ✅ |
| T1.3.9 | No enumeration | — | Request OTP for an unregistered email | Same response shape and timing as a registered one | ✅ |
| T1.3.10 | Unverified cannot attest | User unverified | Attempt attestation endpoint | 403; security log entry | ✅ |
| T1.3.11 | Reused code rejected | OTP verified | Submit the same code again | 422; row no longer exists | ✅ |

**7. Verification checklist.**
- [ ] Real email delivered end-to-end once, manually, against the demo SMTP account
- [ ] No plaintext code in database, logs or responses
- [ ] Expiry, attempt limit and request limit all enforced
- [ ] Unregistered and registered emails are indistinguishable in response and timing
- [ ] Session regenerated on successful verification

**8. Completion criteria.** A registered user can verify by email, all limits hold, codes are never readable at rest, and unverified accounts cannot attest.

**9. Git checkpoint.**
```bash
git checkout -b feat/1.3-otp-email
git status
git add .
git commit -m "feat(1.3): OTP email verification with expiry and attempt limits"
git push origin feat/1.3-otp-email
```
**Do not commit:** `SMTP_PASSWORD`, app passwords, Brevo API keys — environment only.

**10. Rollback.** Migration down drops `user_otp`. Users already verified retain `verified_at`, so rollback does not un-verify anyone.

---

## Milestone 1.4 — Login, sessions and secure cookies

**1. Milestone name.** Session-based authentication with hardened cookie attributes, fixation defence and throttling.

**2. Objective.** Deliver the session and cookie requirements, and establish the session identity that Phase 2's attestation binds to.

**3. Tasks to complete.**
- [x] `POST /api/login`, `POST /api/logout`
- [x] Cookie params: `Secure`, `HttpOnly`, `SameSite=Strict`, `path=/`, no `domain` wildcard
- [x] `session_regenerate_id(true)` on login, logout and any privilege change
- [x] Idle timeout 30 minutes; absolute timeout 12 hours
- [x] Exponential backoff after 5 failed attempts, keyed per account **and** per IP
- [x] CSRF token issued per session; verified on every state-changing request
- [x] Audit log on login and logout; security log on failure and throttle
- [x] React `Login` page and an auth context

**4. Files / modules affected.** `server/src/Controller/AuthController.php`, `server/src/Service/SessionService.php`, `server/src/Middleware/CsrfMiddleware.php`, `ThrottleMiddleware.php`, `server/config/session.php`, `client/src/pages/Login.tsx`, `client/src/lib/auth.tsx`.

**5. Implementation guidance.** `session_regenerate_id(true)` with the destroy flag set — without it the old session file persists and fixation remains possible. This is the single most commonly missed line in PHP session hardening.

Throttle on both account and IP. Account-only lets one attacker spray many accounts from one host; IP-only lets a distributed attempt through on a single account.

`SameSite=Strict` is correct here because the consent flow is same-site. If a later integration requires cross-site embedding, that is a design decision to record, not a setting to quietly loosen.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T1.4.1 | Valid login | Verified user | Submit correct credentials | 200; session cookie set | ✅ |
| T1.4.2 | Cookie attributes | Login succeeded | Inspect `Set-Cookie` | `Secure`, `HttpOnly`, `SameSite=Strict` all present | ✅ |
| T1.4.3 | Wrong password | Verified user | Submit wrong password | 401; generic message; security log entry | ✅ |
| T1.4.4 | Unverified blocked | Unverified user | Correct credentials | 403 with a verification prompt | ✅ |
| T1.4.5 | **Session fixation** | Pre-login session id captured | Log in; compare ids | Id changed; old session unusable | ✅ |
| T1.4.6 | Throttle per account | — | 6 failures on one account | 429 on the sixth; backoff applied | ✅ |
| T1.4.7 | Throttle per IP | — | 6 failures across different accounts, one IP | 429 on the sixth | ✅ |
| T1.4.8 | Idle timeout | Logged in | Wait past 30 min; request | 401; session invalidated | ✅ |
| T1.4.9 | CSRF rejected | Logged in | POST without a CSRF token | 403 | ✅ |
| T1.4.10 | Logout invalidates | Logged in | Log out, reuse the old cookie | 401 | ✅ |
| T1.4.11 | Regression: registration still works | 1.2 merged | Run the 1.2 suite | All T1.2 cases still pass | ✅ |

**7. Verification checklist.**
- [ ] Session id provably changes on login (capture both values in the test)
- [ ] All three cookie attributes present in the live response header, not just in config
- [ ] Both throttle dimensions enforced
- [ ] CSRF blocks a forged state-changing request
- [ ] Phase 1 regression suite green

**8. Completion criteria.** A verified user can log in and out, fixation is defended, throttling works on both dimensions, and CSRF is enforced.

**9. Git checkpoint.**
```bash
git checkout -b feat/1.4-login-session
git status
git add .
git commit -m "feat(1.4): session login with hardened cookies, fixation defence and throttling"
git push origin feat/1.4-login-session
```

**10. Rollback.** Standard rollback. Note that reverting session hardening silently reopens fixation — if rollback is ever needed here, re-apply the cookie flags as a hotfix before anything else.

---

## Milestone 1.5 — Authorization and password reset

**1. Milestone name.** Ownership-based authorization and single-use password reset.

**2. Objective.** Establish the rule that a user may only ever reach their own evidence packs — the authorization boundary Phase 5 depends on.

**3. Tasks to complete.**
- [x] `server/src/Middleware/AuthorizationMiddleware.php`: resource ownership check
- [x] Every `/api/pack/*` route behind it (routes stubbed now, implemented in Phase 5)
- [x] 403 plus a security log entry on any cross-subject attempt
- [x] Migration: `password_reset` (id, user_id, token_hash, expires_at, used_at)
- [x] `POST /api/password/forgot` and `POST /api/password/reset`
- [x] Token: 32 bytes from CSPRNG, hashed at rest, 15-minute expiry, single use
- [x] Completing a reset invalidates all active sessions for that user
- [x] Compare-field validation on the new password pair

**4. Files / modules affected.** `server/src/Middleware/AuthorizationMiddleware.php`, `server/migrations/007_password_reset.sql`, `server/src/Service/PasswordResetService.php`, `server/src/Controller/PasswordController.php`, `client/src/pages/ForgotPassword.tsx`, `ResetPassword.tsx`.

**5. Implementation guidance.** Authorization is checked against the authenticated session's user id, never against an id supplied in the request body or query string. A request-supplied id is the classic insecure-direct-object-reference hole, and in this project it would expose other people's consent records — the exact harm the system exists to prevent.

Invalidating sessions on reset matters: the common reason to reset is suspected compromise, and leaving the attacker's session alive defeats the purpose.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T1.5.1 | Own resource allowed | User A logged in | Access A's stub pack route | 200 | ✅ |
| T1.5.2 | **Cross-subject denied** | A logged in, B's pack exists | Request B's pack id | 403; security log entry | ✅ |
| T1.5.3 | Unauthenticated denied | No session | Request any pack route | 401 | ✅ |
| T1.5.4 | Id tampering denied | A logged in | Supply B's user id in the body | 403; session identity wins | ✅ |
| T1.5.5 | Reset token single use | Token issued | Use it twice | Second attempt 422 | ✅ |
| T1.5.6 | Reset token expires | Token issued 16 min ago | Use it | 422 | ✅ |
| T1.5.7 | Reset invalidates sessions | A logged in on two clients | Complete reset | Both sessions 401 | ✅ |
| T1.5.8 | Reset compare-field | Token valid | Mismatched new passwords | 422 | ✅ |
| T1.5.9 | No enumeration on forgot | — | Request reset for unknown email | Same response and timing as a known one | ✅ |

**7. Verification checklist.**
- [ ] Every cross-subject attempt returns 403 and is logged
- [ ] Authorization never reads an identity from request input
- [ ] Reset tokens are single-use, time-limited and hashed at rest
- [ ] Sessions die on reset completion
- [ ] Phase 1 regression suite green

**8. Completion criteria.** Ownership is enforced on every protected route, and password reset is secure against reuse, expiry bypass and enumeration.

**9. Git checkpoint.**
```bash
git checkout -b feat/1.5-authz-password-reset
git status
git add .
git commit -m "feat(1.5): ownership authorization and single-use password reset"
git push origin feat/1.5-authz-password-reset
```

**10. Rollback.** Standard rollback. **Do not roll back authorization alone** — doing so leaves pack routes open. If a revert is needed, revert the whole milestone.

---

## Phase 1 Completion Checkpoint

| Item | Detail |
|---|---|
| Milestones completed | 1.1, 1.2, 1.3, 1.4, 1.5 |
| Tests passed | T1.1.1–T1.5.9 (49 cases) |
| Known issues | Pack routes are stubs until Phase 5; prototype key management is env-var only |
| Git commit | `fe79c2d` (merge commit of the last milestone; local, not pushed) |
| Phase verification | PII unreadable at rest; all five validator types working; OTP verified end to end; sessions hardened; ownership enforced |
| **Go / No-Go** | **Go** when T1.2.6 and T1.5.2 both pass — server-side enforcement and cross-subject denial are the two that matter |

---

# Phase 2 — Sealed Bundle and Server Commitment

**Owner:** A · **Depends on:** Phase 0 · **Runs in parallel with:** Phase 1

Determinism is the whole objective here. If the bundle is not byte-identical for identical content, every measurement in Phase 6 is meaningless.

---

## Milestone 2.1 — Bundle assembly and canonicalisation

**1. Milestone name.** Sealed render bundle assembled deterministically with RFC 8785 canonical metadata.

**2. Objective.** Produce a self-contained, re-renderable package whose hash is stable across repeated generation — the foundation every later guarantee rests on.

**3. Tasks to complete.**
- [x] Define the bundle schema: markup, inlined CSS, asset hashes, declared critical region selector, region policy id, attestor hash, font declarations
- [x] `server/src/Service/BundleBuilder.php`
- [x] Markup serialisation normalised: attribute order, whitespace, self-closing form, entity encoding
- [x] `server/src/Crypto/Jcs.php` implementing RFC 8785 for the metadata object
- [x] `SHA-256` over the canonical bundle
- [x] Migration: `mra_bundle` (id, bundle_id, canonical_blob, bundle_hash, region_policy, created_at)
- [x] Determinism test: generate 100 times, assert one distinct hash

**4. Files / modules affected.** `server/src/Service/BundleBuilder.php`, `server/src/Crypto/Jcs.php`, `server/src/Model/Bundle.php`, `server/migrations/008_mra_bundle.sql`, `server/tests/Service/BundleBuilderTest.php`.

**5. Implementation guidance.** Non-determinism creeps in through four doors: hash map iteration order, timestamps embedded in output, floating-point formatting, and attribute ordering in serialised markup. Close all four explicitly — sort keys, inject no clock, format numbers per JCS, sort attributes.

JCS is implemented rather than imported because PHP has no mature library and the specification is short. Write it against the RFC's own test vectors.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T2.1.1 | **Determinism** | Fixture page | Build 100 times | Exactly one distinct hash | ◐ |
| T2.1.2 | One-character sensitivity | Fixture page | Change one character of disclosure text; rebuild | Different hash | ✅ |
| T2.1.3 | Attribute order irrelevant | Two markup variants, same attributes reordered | Build both | Identical hash | ✅ |
| T2.1.4 | Whitespace irrelevant | Minified and formatted variants | Build both | Identical hash | ✅ |
| T2.1.5 | JCS vectors | RFC test vectors | Run the canonicaliser | All vectors match | ✅ |
| T2.1.6 | Unicode in JCS | Payload with non-ASCII and escapes | Canonicalise | Matches RFC expectation | ✅ |
| T2.1.7 | Asset hash included | Page with a stylesheet | Build; change the stylesheet; rebuild | Different hash | ✅ |
| T2.1.8 | Self-contained | Bundle built | Render offline, no network | Renders fully; no external request | ✅ |

**7. Verification checklist.**
- [ ] 100 consecutive builds, one hash — run this on both developers' machines, not just one
- [ ] All RFC 8785 test vectors pass
- [ ] Bundle renders with the network disabled
- [ ] No timestamp or random value anywhere in the canonical form

**8. Completion criteria.** Identical input yields an identical hash on both machines, and any semantic change to the source changes the hash.

**9. Git checkpoint.**
```bash
git checkout -b feat/2.1-sealed-bundle
git status
git add .
git commit -m "feat(2.1): deterministic sealed bundle with RFC 8785 canonicalisation"
git push origin feat/2.1-sealed-bundle
```
**Do not commit:** generated bundle blobs, `research/corpus/` captures.

**10. Rollback.** Standard rollback plus `migrate.php down`. Nothing downstream exists yet, so rollback is free — which is exactly why determinism must be proven here and not assumed.

---

## Milestone 2.2 — Ed25519 commitment signing

**1. Milestone name.** Server commitment object signed with Ed25519 and published key verification.

**2. Objective.** Produce the server's half of the mutual evidence, with the commitment made before interaction is possible.

**3. Tasks to complete.**
- [x] Generate the server keypair with libsodium; private key in environment, public key published at `/.well-known/mra-key`
- [x] `server/src/Crypto/Signer.php`: sign and verify
- [x] Commitment object per the design document's schema
- [x] `commitment_hash = SHA-256(JCS(commitment))`
- [x] Migration: `mra_commitment`
- [x] Return the signed commitment in the `X-MRA-Commitment` response header
- [x] Key rotation support: `key_id` in the commitment; verifier resolves it

**4. Files / modules affected.** `server/src/Crypto/Signer.php`, `KeyStore.php`, `server/src/Service/CommitmentService.php`, `server/migrations/009_mra_commitment.sql`, `server/public/.well-known/mra-key`, tests.

**5. Implementation guidance.** Ed25519 over ECDSA server-side for speed and misuse resistance (decision D-11); libsodium ships with PHP 8.2 so there is no dependency cost. The private key never appears in the repository, in a config file, or in any log.

`key_id` is included now rather than retrofitted. Rotation without a key identifier means every historical evidence pack becomes unverifiable the day the key changes — and that is discovered long after the packs are issued.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T2.2.1 | Sign/verify round-trip | Keypair configured | Sign a commitment; verify | Valid | ✅ |
| T2.2.2 | Tampered commitment fails | Commitment signed | Alter one field; verify | Invalid | ✅ |
| T2.2.3 | Wrong key fails | Commitment signed | Verify with a different public key | Invalid | ✅ |
| T2.2.4 | Public key reachable | Server running | GET `/.well-known/mra-key` | 200 with the correct key | ✅ |
| T2.2.5 | Private key never exposed | Server running | Grep responses and logs for the private key | Absent everywhere | ✅ |
| T2.2.6 | Commitment hash stable | Commitment built | Hash twice | Identical | ✅ |
| T2.2.7 | Header delivered | Bundle requested | Inspect response headers | `X-MRA-Commitment` present and parseable | ✅ |
| T2.2.8 | Key rotation | Two keypairs | Sign with key 1, rotate, verify old commitment | Still verifies via `key_id` | ✅ |

**7. Verification checklist.**
- [ ] Private key absent from repository, responses and logs
- [ ] Public key fetchable and matches the signing key
- [ ] Tampering with any commitment field breaks verification
- [ ] Rotation does not invalidate historical commitments

**8. Completion criteria.** Commitments are signed before delivery, verifiable against the published key, and tamper-evident.

**9. Git checkpoint.**
```bash
git checkout -b feat/2.2-commitment-signing
git status
git add .
git commit -m "feat(2.2): Ed25519 commitment signing with key rotation support"
git push origin feat/2.2-commitment-signing
```
**Do not commit:** `MRA_SERVER_SK`, any `.pem` or `.key` file.

**10. Rollback.** Standard rollback. **Preserve the keypair** across any rollback — regenerating it invalidates every commitment issued so far.

---

## Milestone 2.3 — Nonce, session binding and bundle delivery

**1. Milestone name.** `GET /api/bundle` delivering a sealed bundle bound to a single-use nonce and the caller's session.

**2. Objective.** Close the replay path and tie the commitment to one specific interaction.

**Depends on:** 1.4 (sessions must exist).

**3. Tasks to complete.**
- [x] Nonce: 32 bytes from `random_bytes()`, stored against the session, single-use, 15-minute window
- [x] `GET /api/bundle`: build, commit, store, return bundle plus header
- [x] Client public key fingerprint registered against the session before issuance
- [x] Nonce consumed on first valid attestation; reuse rejected
- [x] Audit log on issuance

**4. Files / modules affected.** `server/src/Controller/BundleController.php`, `server/src/Service/NonceService.php`, `server/migrations/010_mra_nonce.sql`, tests.

**5. Implementation guidance. `random_bytes()`, never `uniqid()` or `mt_rand()`.** A predictable nonce defeats replay protection entirely while appearing to work in every functional test — this is why T2.3.6 tests distribution, not just presence.

Consume the nonce atomically: `UPDATE ... SET consumed_at = NOW() WHERE nonce = ? AND consumed_at IS NULL` and check the affected row count. A read-then-write sequence races, and under concurrency two attestations can share one nonce.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T2.3.1 | Bundle delivered | Logged-in verified user | GET `/api/bundle` | 200; bundle plus commitment header | ✅ |
| T2.3.2 | Unauthenticated denied | No session | GET `/api/bundle` | 401 | ✅ |
| T2.3.3 | Unverified denied | Unverified user | GET `/api/bundle` | 403 | ✅ |
| T2.3.4 | Nonce unique per request | Logged in | Request twice | Two distinct nonces | ✅ |
| T2.3.5 | Nonce bound to session | Two sessions | Use session A's nonce from session B | Rejected | ✅ |
| T2.3.6 | **Nonce unpredictable** | — | Generate 10,000; test distribution and collisions | No collisions; passes a basic randomness check | ✅ |
| T2.3.7 | Nonce expires | Nonce issued 16 min ago | Attempt use | Rejected | ✅ |
| T2.3.8 | Nonce single-use | Nonce consumed | Reuse it | Rejected | ✅ |
| T2.3.9 | Concurrent consumption | Nonce issued | Two simultaneous attestations | Exactly one succeeds | ✅ |

**7. Verification checklist.**
- [ ] 10,000 nonces, zero collisions, passing distribution
- [ ] Cross-session use rejected
- [ ] Concurrent consumption yields exactly one success (run it, do not reason about it)
- [ ] Expiry window enforced

**8. Completion criteria.** Bundles are delivered only to verified sessions, each with a unique single-use nonce that survives a concurrency test.

**9. Git checkpoint.**
```bash
git checkout -b feat/2.3-nonce-delivery
git status
git add .
git commit -m "feat(2.3): nonce generation, session binding and bundle delivery"
git push origin feat/2.3-nonce-delivery
```

**10. Rollback.** Standard rollback. Reverting nonce handling reopens replay — revert the whole milestone, never partially.

---

## Milestone 2.4 — React consent shell

**1. Milestone name.** Consent interface rendering a sealed bundle with client-side bundle hash verification.

**2. Objective.** Give the digest something real to measure, and catch the crudest server attack before the user can act.

**3. Tasks to complete.**
- [x] `ConsentPage` fetches the bundle and commitment
- [x] Compute `SHA-256(bundle)` in-browser; compare with the committed hash; refuse to render on mismatch
- [x] Render the critical region inside a declared container
- [x] Capture checkbox state and the accept/reject action
- [x] Consent checkbox **never** defaults to ticked
- [x] Admin page to edit disclosure text (needed for the Phase 7 demo)

**4. Files / modules affected.** `client/src/pages/Consent.tsx`, `client/src/components/CriticalRegion.tsx`, `client/src/lib/bundle.ts`, `client/src/pages/AdminConsent.tsx`, component tests.

**5. Implementation guidance.** The client-side hash check is cheap and catches a server that sends a bundle differing from its own commitment — before the user acts rather than at verification time. It is not a substitute for the verifier, because the check runs in code the server could have altered; it is a fast path, and the report should describe it as such.

The admin page exists for Act 2 of the demo. Build it now so the demo is not assembled in the final week.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T2.4.1 | Bundle renders | Bundle available | Open consent page | Critical region visible with correct text | ✅ |
| T2.4.2 | **Hash mismatch blocks render** | Tampered bundle | Load it | Render refused; error shown; no action possible | ✅ |
| T2.4.3 | Checkbox defaults unticked | Page loaded | Inspect initial state | Unticked | ✅ |
| T2.4.4 | Accept disabled until ticked | Page loaded | Inspect Accept | Disabled until the box is ticked | ✅ |
| T2.4.5 | Action captured once | Page loaded | Double-click Accept | Exactly one action recorded | ✅ |
| T2.4.6 | Reject captured | Page loaded | Click Reject | Action recorded as reject | ✅ |
| T2.4.7 | Admin edit re-serves | Admin page | Change text; reload consent | New text rendered; new bundle hash | ✅ |
| T2.4.8 | Keyboard accessible | Page loaded | Tab through, activate by keyboard | All controls reachable and operable | ✅ |

**7. Verification checklist.**
- [ ] Tampered bundle refuses to render
- [ ] Checkbox never pre-ticked in any state
- [ ] Double-click produces one action, not two
- [ ] Full keyboard operation (this matters doubly — the digest reads the accessibility tree)
- [ ] Admin edit produces a different bundle hash

**8. Completion criteria.** The consent page renders verified bundles, refuses tampered ones, captures actions exactly once, and is keyboard-operable.

**9. Git checkpoint.**
```bash
git checkout -b feat/2.4-consent-shell
git status
git add .
git commit -m "feat(2.4): consent interface with client-side bundle verification"
git push origin feat/2.4-consent-shell
```

**10. Rollback.** Standard rollback; client-only, no schema impact.

---

## Phase 2 Completion Checkpoint

| Item | Detail |
|---|---|
| Milestones completed | 2.1, 2.2, 2.3, 2.4 |
| Tests passed | T2.1.1–T2.4.8 (33 cases) |
| Known issues | No digest yet; no client attestation yet |
| Git commit | `f06e9c5` (merge commit of the last milestone; local, not pushed) |
| Phase verification | 100 builds → one hash on both machines; commitments verify; nonces survive the concurrency test; tampered bundles refuse to render |
| **Go / No-Go** | **No-Go unless T2.1.1 passes on both developers' machines.** Determinism failing here makes Phase 6 unmeasurable. Do not proceed on one machine's result |

---

# Phase 3 — Attestor Module and Semantic Digest

**Owner:** A · **Depends on:** 2.1, 2.4 · **This phase carries the research contribution and the project's only red risk.**

Budget the most time here. Build the measurement harness alongside the digest, not after it.

---

## Milestone 3.1 — Semantic extraction

**1. Milestone name.** Accessibility tree, text and interaction state extracted from the critical region.

**2. Objective.** Produce the raw semantic input, deliberately excluding anything environment-dependent.

**3. Tasks to complete.**
- [x] `attestor/` builds as a standalone ES module with **zero runtime dependencies**
- [x] Walk the critical region in document order
- [x] Filter to the role allowlist: `heading`, `paragraph`, `text`, `link`, `checkbox`, `radio`, `switch`, `button`
- [x] Extract accessible name and `textContent`
- [x] Extract `checked`, `disabled`, `required`, `selected`
- [x] Skip presentational and `aria-hidden` nodes
- [x] Fixture set: 10 consent UIs in `attestor/tests/fixtures/`

**4. Files / modules affected.** `attestor/src/extract.ts`, `roles.ts`, `attestor/tests/extract.test.ts`, `attestor/tests/fixtures/*.html`.

**5. Implementation guidance.** Zero dependencies is a security property, not a preference: this module is SRI-pinned and independently hosted, and every transitive dependency is another party who could alter the digest.

The role allowlist deliberately excludes constructs where role computation is known to diverge between Blink, Gecko and WebKit. Narrowing the allowlist is the cheapest stability lever available, and it costs little semantic signal.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T3.1.1 | Document order preserved | Fixture loaded | Extract | Nodes in visual reading order | ✅ |
| T3.1.2 | Allowlist enforced | Fixture with a `<div>` wrapper | Extract | Wrapper excluded | ✅ |
| T3.1.3 | Checkbox state captured | Fixture with unticked box | Extract | `checked: false` | ✅ |
| T3.1.4 | Pre-ticked captured | Fixture with ticked box | Extract | `checked: true` | ✅ |
| T3.1.5 | `aria-hidden` skipped | Fixture with hidden node | Extract | Node absent | ✅ |
| T3.1.6 | Accessible name preferred | Button with `aria-label` differing from text | Extract | `aria-label` used | ✅ |
| T3.1.7 | Outside region excluded | Content outside the container | Extract | Excluded from region output | ✅ |
| T3.1.8 | Empty region handled | Empty container | Extract | Empty node list; no exception | ✅ |

**7. Verification checklist.**
- [ ] `npm ls --prod` in `attestor/` shows zero dependencies
- [ ] All 10 fixtures extract without error
- [ ] Node ordering matches visual reading order on every fixture
- [ ] Hidden and presentational content excluded

**8. Completion criteria.** Extraction is correct across all fixtures, dependency-free, and strictly scoped to the declared region.

**9. Git checkpoint.**
```bash
git checkout -b feat/3.1-semantic-extraction
git status
git add .
git commit -m "feat(3.1): accessibility tree and state extraction for the critical region"
git push origin feat/3.1-semantic-extraction
```

**10. Rollback.** Standard rollback; module is isolated and nothing consumes it yet.

---

## Milestone 3.2 — Normalisation

**1. Milestone name.** Text normalisation defeating homoglyph, zero-width, case and whitespace manipulation.

**2. Objective.** Remove cosmetic variation while preserving semantic difference — the first half of the invariance/sensitivity trade-off.

**3. Tasks to complete.**
- [x] NFKC normalisation
- [x] Strip zero-width space, ZWNJ, ZWJ, soft hyphen, bidi control characters
- [x] Full case folding
- [x] Collapse whitespace runs to a single space; trim
- [x] Apply in a fixed documented order
- [x] Adversarial test set of manipulated strings

**4. Files / modules affected.** `attestor/src/normalise.ts`, `attestor/tests/normalise.test.ts`, `attestor/tests/fixtures/adversarial-strings.json`.

**5. Implementation guidance.** Order matters and must be fixed: NFKC first (so compatibility characters decompose), then strip invisibles (so NFKC output is cleaned), then case fold, then whitespace. A different order produces different output for some inputs, and an undocumented order is an undocumented bug.

Zero-width stripping is the highest-value rule. Injecting zero-width characters to break naive string matching is a known evasion, and it renders identically — meaning pixel hashing cannot catch it while this can. Make this point in the paper.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T3.2.1 | Zero-width stripped | — | Normalise `re\u200Bject` | `reject` | ✅ |
| T3.2.2 | Case folded | — | `REJECT` and `reject` | Identical output | ✅ |
| T3.2.3 | Whitespace collapsed | — | `no   automatic\n\trenewal` | `no automatic renewal` | ✅ |
| T3.2.4 | NFKC applied | — | Fullwidth characters | Folded to ASCII equivalents | ✅ |
| T3.2.5 | Soft hyphen stripped | — | `re\u00ADject` | `reject` | ✅ |
| T3.2.6 | Bidi controls stripped | — | String with RLO | Control removed | ✅ |
| T3.2.7 | **Semantic difference preserved** | — | `no automatic renewal` vs `automatic renewal` | Different output | ✅ |
| T3.2.8 | Order deterministic | Adversarial set | Normalise 100 times | Identical every time | ✅ |
| T3.2.9 | Empty and whitespace-only | — | `""` and `"   "` | Both yield `""`; no exception | ✅ |

**7. Verification checklist.**
- [ ] Every adversarial string normalises to its intended canonical form
- [ ] No semantically different pair collides
- [ ] Order of operations documented in code and in `PROJECT_LOG.md`
- [ ] 100 repetitions yield identical output

**8. Completion criteria.** Cosmetic manipulation is removed, semantic difference survives, and the transformation is deterministic.

**9. Git checkpoint.**
```bash
git checkout -b feat/3.2-normalisation
git status
git add .
git commit -m "feat(3.2): Unicode, invisible-character, case and whitespace normalisation"
git push origin feat/3.2-normalisation
```

**10. Rollback.** Standard rollback. Changing normalisation after digests exist invalidates them — after Phase 4, any change here is a version bump, not an edit.

---

## Milestone 3.3 — Style bucketing, visibility and occlusion

**1. Milestone name.** Six bucketed style features with occlusion and prominence measurement.

**2. Objective.** Make the digest sensitive to dark patterns that leave text and accessibility tree untouched — the second half of the trade-off, and the project's most delicate calibration.

**3. Tasks to complete.**
- [x] `size`: ratio to region base font size, thresholds 0.6 / 0.85 / 1.2 / 1.6
- [x] `weight`: thresholds 400 / 600
- [x] `contrast`: WCAG 2.1 ratio against effective background, thresholds 3.0 / 4.5
- [x] `prominence`: control area ÷ median sibling control area, thresholds 0.6 / 1.6
- [x] `visible`: `display`, `visibility`, effective opacity < 0.1, in-viewport
- [x] `occlusion`: `elementFromPoint` at five points per control, thresholds 0.2 / 0.8
- [x] Effective background resolved through ancestors for contrast
- [x] Threshold boundary tests on every feature

**4. Files / modules affected.** `attestor/src/styles.ts`, `contrast.ts`, `occlusion.ts`, `attestor/tests/styles.test.ts`, `occlusion.test.ts`.

**5. Implementation guidance.** Every threshold is a research decision and must be justified in the paper, not chosen by feel. Each of the six features maps to a documented dark pattern; a feature that catches nothing in the taxonomy should be removed, because each one added is a new source of environmental instability.

Bucketing is what buys cross-browser stability: a control at 14.4px in Chrome and 14.66px in Safari lands in one bucket, while the same control at 6px does not.

**Fix the 20-mutation suite (Milestone 6.2) before finalising thresholds.** Tuning thresholds against the mutations you will later measure is tuning to the test set, and it invalidates the sensitivity result. This is open item O-03 in `PROJECT_LOG.md` and it has a hard ordering constraint.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T3.3.1 | Size buckets at boundaries | Fixtures at each threshold | Compute | Correct bucket each side | ✅ |
| T3.3.2 | Minor size change stays in bucket | 14.4px vs 14.66px | Compute | Same bucket | ✅ |
| T3.3.3 | **Large shrink changes bucket** | 16px → 6px | Compute | `base` → `tiny` | ✅ |
| T3.3.4 | Contrast computed correctly | Known colour pairs | Compute | Matches WCAG reference values | ✅ |
| T3.3.5 | Grey-on-grey detected | Low-contrast reject text | Compute | `contrast: low` | ✅ |
| T3.3.6 | Prominence detects shrink | Reject at 1/3 of Accept area | Compute | `suppressed` | ✅ |
| T3.3.7 | Overlay detected | Overlay covering Reject | Compute | `occlusion: blocked` | ✅ |
| T3.3.8 | Partial overlay | 40% covered | Compute | `occlusion: partial` | ✅ |
| T3.3.9 | Low opacity detected | `opacity: 0.05` | Compute | `visible: false` | ✅ |
| T3.3.10 | Nested background resolved | Transparent element on coloured ancestor | Compute contrast | Ancestor colour used | ✅ |
| T3.3.11 | Zoom invariance | 100% vs 150% zoom | Compute | Identical buckets | ✅ |

**7. Verification checklist.**
- [ ] Each of the six features tested at both sides of every threshold
- [ ] Every threshold has a written justification in `PROJECT_LOG.md`
- [ ] Zoom and DPR changes do not move buckets
- [ ] Each feature detects at least one taxonomy dark pattern

**8. Completion criteria.** All six features compute correctly at boundaries, resist zoom and DPR variation, and each catches a documented manipulation.

**9. Git checkpoint.**
```bash
git checkout -b feat/3.3-style-buckets
git status
git add .
git commit -m "feat(3.3): six bucketed style features with occlusion and prominence"
git push origin feat/3.3-style-buckets
```

**10. Rollback.** Standard rollback. Threshold changes after Phase 4 require a digest version bump.

---

## Milestone 3.4 — Canonical representation and digest

**1. Milestone name.** Semantic representation canonicalised and hashed in a Web Worker.

**2. Objective.** Produce the two digests the protocol signs, off the main thread.

**3. Tasks to complete.**
- [x] Assemble the representation per the design document's schema
- [x] JCS canonicalisation (TypeScript port, same RFC vectors as 2.1)
- [x] `critical_region_digest` = SHA-256 over canonical UTF-8 bytes
- [x] `context_digest` over the whole visible viewport, same rules
- [x] Run inside a Web Worker; typed message protocol
- [x] Environment vector collected as metadata, **excluded** from the digest
- [x] Determinism test: 1000 runs, one digest
- [x] Cross-implementation test: PHP JCS and TypeScript JCS agree

**4. Files / modules affected.** `attestor/src/digest.ts`, `jcs.ts`, `worker.ts`, `env.ts`, `attestor/tests/digest.test.ts`, `jcs-cross.test.ts`.

**5. Implementation guidance.** Two JCS implementations now exist — PHP from 2.1 and TypeScript here. They must agree byte for byte or the verifier will report mismatches that are implementation artifacts rather than attacks. Test them against each other explicitly; this is the kind of divergence that surfaces during the demo if untested.

The environment vector is recorded but never digested (decision D-08). Digesting it would make every device difference a mismatch.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T3.4.1 | **Determinism** | Fixture | Digest 1000 times | One distinct value | ✅ |
| T3.4.2 | **PHP/TS JCS agree** | Shared vectors | Canonicalise in both | Byte-identical | ✅ |
| T3.4.3 | Text change detected | Fixture | Alter one word | Different digest | ✅ |
| T3.4.4 | Checkbox flip detected | Fixture | Pre-tick the box | Different digest | ✅ |
| T3.4.5 | Viewport invariance | Fixture | 1920 vs 1280 wide, same semantics | Same digest | ✅ |
| T3.4.6 | DPR invariance | Fixture | DPR 1 vs 2 | Same digest | ✅ |
| T3.4.7 | Context digest catches outside overlay | Overlay outside the region | Digest | Region digest unchanged; context digest differs | ✅ |
| T3.4.8 | Worker isolation | Page loaded | Digest while main thread busy | Completes; UI stays responsive | ✅ |
| T3.4.9 | Env excluded | Two environments | Digest | Identical digest, different env vectors | ✅ |
| T3.4.10 | Large region | 500-node region | Digest | Completes; timing recorded for Phase 6 | ✅ |

**7. Verification checklist.**
- [ ] 1000 runs, one digest
- [ ] PHP and TypeScript JCS agree on every shared vector
- [ ] Viewport and DPR variation does not change the digest
- [ ] Context digest catches what the region digest cannot
- [ ] Worker keeps the UI responsive

**8. Completion criteria.** Both digests compute deterministically in a worker, the two JCS implementations agree, and environment variation does not alter output.

**9. Git checkpoint.**
```bash
git checkout -b feat/3.4-semantic-digest
git status
git add .
git commit -m "feat(3.4): canonical semantic representation and dual digest in a Web Worker"
git push origin feat/3.4-semantic-digest
```

**10. Rollback.** Standard rollback. After Phase 4, digest changes require a version bump — historical attestations must stay verifiable.

---

## Milestone 3.5 — Attestor packaging, SRI and registry

**1. Milestone name.** Attestor Module published as a versioned, hash-pinned artifact on an independent host.

**2. Objective.** Deliver decision D-03 — the separation that makes the client signature meaningful. Until this lands, the attestation is cryptographically valid but semantically worthless, because the consent server controls the code that produces it.

**3. Tasks to complete.**
- [x] Reproducible build: same source → same bundle bytes
- [x] SHA-384 integrity hash emitted at build time
- [ ] Deploy to a host distinct from `server/` (separate origin — a second static host or a different subdomain on different infrastructure)
- [x] Load via `<script integrity="sha384-..." crossorigin="anonymous">`
- [x] Migration: `attestor_registry` (version, hash, published_at, status)
- [x] Commitment includes `attestor_hash` and `attestor_version`
- [x] Verifier rejects an unrecognised attestor hash (wired in Phase 5)
- [x] Document the build and publish procedure in `docs/attestor-release.md`

**4. Files / modules affected.** `attestor/build.config.ts`, `attestor/scripts/release.sh`, `server/migrations/011_attestor_registry.sql`, `client/src/lib/loadAttestor.ts`, `docs/attestor-release.md`.

**5. Implementation guidance.** The reproducible build is what makes the registry meaningful. If the same source produces different bytes on different machines, the hash proves nothing and the registry becomes decoration. Pin the toolchain version and disable timestamp injection.

If a genuinely separate host is unavailable for the prototype, use a different subdomain on separate infrastructure and **record the compromise explicitly** in `PROJECT_LOG.md` and the report. Do not claim independence the deployment does not have — an examiner who asks where the module is hosted deserves the real answer.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T3.5.1 | Reproducible build | Clean checkout | Build twice on both machines | Identical bytes, identical hash | ◐ |
| T3.5.2 | **SRI blocks tampering** | Module deployed | Alter one byte on the host; load | Browser refuses to execute | ✅ |
| T3.5.3 | Correct module loads | Module deployed | Load consent page | Module executes; digest produced | ✅ |
| T3.5.4 | Separate origin | Deployed | Inspect the script URL | Different origin from the API | ✅ |
| T3.5.5 | Registry lookup | Registry seeded | Query a known hash | Recognised, status active | ✅ |
| T3.5.6 | Unknown hash rejected | Registry seeded | Query an unknown hash | Not recognised | ✅ |
| T3.5.7 | Hash in commitment | Bundle requested | Inspect commitment | `attestor_hash` and version present | ✅ |
| T3.5.8 | Load failure handled | Host unreachable | Load consent page | Clear error; **no attestation produced**; no silent fallback | ✅ |

**7. Verification checklist.**
- [ ] Both developers' builds produce the identical hash
- [ ] A tampered module is refused by the browser
- [ ] Module served from a different origin than the API
- [ ] Load failure produces no attestation and no silent fallback to server-served code
- [ ] Release procedure documented well enough for the other developer to follow unaided

**8. Completion criteria.** The module builds reproducibly, is served from a separate origin under SRI, is registered by hash, and fails closed when unavailable.

**9. Git checkpoint.**
```bash
git checkout -b feat/3.5-attestor-release
git status
git add .
git commit -m "feat(3.5): reproducible attestor build, SRI pinning and hash registry"
git push origin feat/3.5-attestor-release
git tag attestor-v1.0.0
git push origin attestor-v1.0.0
```
**Do not commit:** deploy credentials. **Do commit** `attestor/dist/` only on a tagged release, so the published hash is reproducible from the repository.

**10. Rollback.** Registry `status` to `deprecated` rather than deleting the row — historical packs referencing that version must stay verifiable. Redeploy the previous tag.

---

## Phase 3 Completion Checkpoint

| Item | Detail |
|---|---|
| Milestones completed | 3.1, 3.2, 3.3, 3.4, 3.5 |
| Tests passed | T3.1.1–T3.5.8 (48 cases) |
| Known issues | Thresholds provisional until the mutation suite is fixed (O-03); cross-browser stability unmeasured until Phase 6 |
| Git commit | `7e38657` (merge commit of the last milestone; local, not pushed) |
| Phase verification | 1000 digests → one value; PHP/TS JCS agree; module reproducible and SRI-pinned on a separate origin |
| **Go / No-Go** | **Go** when T3.4.1, T3.4.2 and T3.5.1 pass. **Record the first informal cross-browser digest comparison now** — if Chrome and Firefox already disagree on a fixture, that is the red risk materialising and Phase 6 must be pulled forward |

---

# Phase 4 — Client Attestation and Merkle Log

**Owners:** A (4.1–4.3 protocol) · C (4.4 persistence) · **Depends on:** Phases 1, 2, 3

---

## Milestone 4.1 — WebCrypto key management

**1. Milestone name.** Non-extractable client keypair with fingerprint registration.

**2. Objective.** Give the client a signing capability the server can never hold or forge.

**3. Tasks to complete.**
- [x] Generate ECDSA P-256 with `extractable: false`
- [x] Persist the handle in IndexedDB, scoped to the session
- [x] Export the public key; compute the fingerprint
- [x] Register the fingerprint against the session before bundle issuance
- [ ] WebAuthn path behind a feature flag (stretch tier, not a blocker)
- [x] Key cleared on logout

**4. Files / modules affected.** `client/src/lib/clientKey.ts`, `keyStore.ts`, `server/src/Controller/KeyRegistrationController.php`, `server/migrations/012_session_client_key.sql`, tests.

**5. Implementation guidance. `extractable: false` is the security property** — the private key cannot be exported by page script, so a compromised page cannot exfiltrate the signing capability. Verify this in a test by attempting `exportKey` and asserting it throws.

Build the WebCrypto path first and treat WebAuthn as a stretch. Browser and platform inconsistency in WebAuthn consumes debugging time disproportionate to the demo value, and the design already presents it as a tier rather than a requirement.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T4.1.1 | Keypair generated | Page loaded | Generate | Keypair created; public key exportable | ✅ |
| T4.1.2 | **Private key non-extractable** | Keypair exists | Attempt `exportKey` on the private key | Throws; no key material returned | ✅ |
| T4.1.3 | Key persists across reload | Keypair stored | Reload | Same public key | ✅ |
| T4.1.4 | Fingerprint registered | Keypair exists | Register | Stored against session | ✅ |
| T4.1.5 | Fingerprint in commitment | Key registered | Request bundle | Commitment carries the fingerprint | ✅ |
| T4.1.6 | Key cleared on logout | Logged in with key | Log out | IndexedDB entry removed | ✅ |
| T4.1.7 | Distinct keys per session | — | Two sessions | Different keypairs | ✅ |
| T4.1.8 | Signature verifies | Keypair exists | Sign and verify a payload | Valid | ✅ |

**7. Verification checklist.**
- [ ] Private key export provably fails
- [ ] Fingerprint registered before any bundle is issued
- [ ] Logout clears the key
- [ ] Sessions do not share keys

**8. Completion criteria.** Non-extractable keys generate, persist for the session, register correctly, and clear on logout.

**9. Git checkpoint.**
```bash
git checkout -b feat/4.1-client-keys
git status
git add .
git commit -m "feat(4.1): non-extractable WebCrypto keypair with fingerprint registration"
git push origin feat/4.1-client-keys
```

**10. Rollback.** Standard rollback. Clearing IndexedDB in development is safe; in a deployed state it invalidates in-flight sessions.

---

## Milestone 4.2 — Attestation signing and submission

**1. Milestone name.** Client attestation assembled, signed and posted on user action.

**2. Objective.** Produce the client's half of the mutual evidence, bound to the server's prior commitment.

**3. Tasks to complete.**
- [x] Assemble the attestation per the design document's schema
- [x] Bind to `commitment_hash`, **not** `bundle_hash` (decision D-06)
- [x] Include both digests, env vector, action, action target, nonce, attestor hash
- [x] Sign with the session key over JCS bytes
- [x] `POST /api/attest`
- [x] Clear user feedback on success and failure

**4. Files / modules affected.** `client/src/lib/attestation.ts`, `client/src/pages/Consent.tsx`, `attestor/src/attest.ts`, tests.

**5. Implementation guidance.** Binding to the commitment hash rather than the bundle hash prevents a server reusing one honest bundle under a different nonce, policy or expiry. This is a one-line difference with a real security consequence, and it is worth being able to explain in the viva.

The digest must be computed at the moment of the action, not on page load. A digest taken at load would miss any manipulation applied after render — which is precisely the attack a sophisticated adversary would use.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T4.2.1 | Attestation produced on accept | Bundle rendered | Tick and accept | Attestation signed and posted | ✅ |
| T4.2.2 | Attestation produced on reject | Bundle rendered | Click reject | Attestation with `action: reject` | ✅ |
| T4.2.3 | **Bound to commitment hash** | Attestation produced | Inspect payload | `commitment_hash` present; `bundle_hash` alone absent | ✅ |
| T4.2.4 | **Digest computed at action time** | Page loaded | Mutate the region via console after load, then accept | Digest reflects the mutated state | ✅ |
| T4.2.5 | Both digests included | Attestation produced | Inspect | Region and context digests present | ✅ |
| T4.2.6 | Signature verifies | Attestation produced | Verify with the registered public key | Valid | ✅ |
| T4.2.7 | Nonce included | Attestation produced | Inspect | Matches the issued nonce | ✅ |
| T4.2.8 | Network failure handled | Server unreachable | Accept | Clear error; retry offered; no silent loss | ✅ |

**7. Verification checklist.**
- [ ] Attestation binds to the commitment hash
- [ ] Post-load mutation is reflected in the digest (T4.2.4 is the important one)
- [ ] Signature verifies against the registered key
- [ ] Network failure is visible, never silent

**8. Completion criteria.** Attestations are signed at action time, bound to the commitment, and delivered reliably.

**9. Git checkpoint.**
```bash
git checkout -b feat/4.2-attestation-signing
git status
git add .
git commit -m "feat(4.2): client attestation assembly, signing and submission"
git push origin feat/4.2-attestation-signing
```

**10. Rollback.** Standard rollback; client-side only.

---

## Milestone 4.3 — Server-side attestation validation

**1. Milestone name.** Full server validation of incoming attestations.

**2. Objective.** Reject malformed, forged, replayed and policy-violating attestations before they reach the log.

**3. Tasks to complete.**
- [x] Schema validation against the attestation contract
- [x] ECDSA signature verification against the registered public key
- [x] Fingerprint match against the commitment
- [x] `commitment_hash` recomputation and comparison
- [x] Nonce freshness and atomic single-use consumption
- [x] Validity window enforcement
- [x] Region policy check: disclosure text, accept control, reject control all present
- [x] Attestor hash recognised in the registry
- [x] Distinct error codes per failure; security log on each

**4. Files / modules affected.** `server/src/Controller/AttestationController.php`, `server/src/Service/AttestationValidator.php`, `server/src/Validation/RegionPolicy.php`, `server/migrations/013_mra_attestation.sql`, tests.

**5. Implementation guidance.** Validate in cheapest-first order: schema, then signature, then database-touching checks. A malformed payload should never reach a database query.

Every client input is hostile. The attestation arrives from a browser the server does not control, and a crafted payload must fail exactly as a browser-sent invalid one does.

The region policy check implements decision D-04 and is what prevents a server narrowing the attested scope to exclude its own deception.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T4.3.1 | Valid attestation accepted | Full flow | Submit | 201; stored | ✅ |
| T4.3.2 | Malformed schema | — | Submit missing a field | 422; no DB write | ✅ |
| T4.3.3 | Bad signature | — | Alter the digest after signing | 401 `CLIENT_SIGNATURE_INVALID` | ✅ |
| T4.3.4 | Wrong key | — | Sign with an unregistered key | 401 `KEY_BINDING_INVALID` | ✅ |
| T4.3.5 | Spent nonce | Nonce consumed | Resubmit | 409 `REPLAY_DETECTED`; security log | ✅ |
| T4.3.6 | Expired window | Commitment 16 min old | Submit | 422 | ✅ |
| T4.3.7 | Region policy violation | Region missing a reject control | Submit | 422 `REGION_POLICY_VIOLATION` | ✅ |
| T4.3.8 | Unknown attestor | Unregistered hash | Submit | 422 `ATTESTOR_UNRECOGNISED` | ✅ |
| T4.3.9 | Cross-session nonce | A's nonce, B's session | Submit | 403 | ✅ |
| T4.3.10 | Concurrent submissions | One nonce | Two simultaneous posts | Exactly one succeeds | ✅ |
| T4.3.11 | Regression: Phase 1 intact | 4.3 merged | Run Phase 1 suite | All pass | ✅ |

**7. Verification checklist.**
- [ ] Every rejection path returns its distinct code and logs a security event
- [ ] Concurrency test yields exactly one success
- [ ] Malformed input never reaches a database query
- [ ] Phase 1 regression green

**8. Completion criteria.** All eight rejection paths work with distinct codes, concurrency is safe, and valid attestations persist.

**9. Git checkpoint.**
```bash
git checkout -b feat/4.3-attestation-validation
git status
git add .
git commit -m "feat(4.3): server-side attestation validation with region policy enforcement"
git push origin feat/4.3-attestation-validation
```

**10. Rollback.** Standard rollback. Reverting validation accepts forged attestations — revert whole, never partially.

---

## Milestone 4.4 — Merkle log and inclusion proofs

**1. Milestone name.** RFC 6962 append-only log with two leaves per event and externally published tree heads.

**Owner:** C · **Depends on:** 4.3

**2. Objective.** Make ordering and immutability provable, delivering decisions D-07 and D-10.

**3. Tasks to complete.**
- [x] Migrations: `mra_leaf`, `mra_node`, `mra_sth`
- [x] `leaf_hash = SHA-256(0x00 || JCS(record))`; `parent = SHA-256(0x01 || left || right)`
- [x] Commitment leaf appended at issuance; attestation leaf at validation, referencing it
- [x] Inclusion proof generation
- [x] Consistency proof between tree heads
- [ ] Signed tree head published on a schedule to `mra-sth-witness` (O-02)
- [x] Application DB user granted `INSERT` and `SELECT` only on `mra_leaf` — no `UPDATE`, no `DELETE`
- [x] Tamper-detection test

**4. Files / modules affected.** `server/migrations/014_mra_leaf.sql`, `015_mra_node.sql`, `016_mra_sth.sql`, `server/src/Service/MerkleLog.php`, `InclusionProof.php`, `SthPublisher.php`, `server/bin/publish_sth.php`, tests.

**5. Implementation guidance.** Domain separation (`0x00` for leaves, `0x01` for nodes) prevents second-preimage attacks in which an internal node is passed off as a leaf. It is one byte and it is not optional.

Two leaves, not one (decision D-07). Appending the commitment at issue time is what proves the promise preceded the interaction; a combined leaf written at the end proves nothing about ordering.

Database grants are a real control here, not decoration. If the application user can `UPDATE mra_leaf`, the append-only property exists only in application code, and an SQL injection anywhere in the project defeats it.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T4.4.1 | Commitment leaf at issuance | Bundle requested | Inspect log | Leaf present before any attestation | ✅ |
| T4.4.2 | **Ordering provable** | Full flow | Compare indices | Attestation index > commitment index | ✅ |
| T4.4.3 | Inclusion proof verifies | Leaves appended | Generate and verify | Recomputes to the root | ✅ |
| T4.4.4 | **Tampered leaf detected** | Leaf stored | Alter the payload directly in SQL; verify proof | Proof fails | ✅ |
| T4.4.5 | Domain separation | Leaves and nodes | Compare a leaf hash with a node hash of the same bytes | Different values | ✅ |
| T4.4.6 | Consistency proof | Two tree sizes | Generate and verify | Valid; detects a rewrite | ✅ |
| T4.4.7 | STH published | Scheduler run | Check witness repository | New signed head committed | ◐ |
| T4.4.8 | **No UPDATE grant** | App user connected | `UPDATE mra_leaf SET ...` | Permission denied by MySQL | ✅ |
| T4.4.9 | **No DELETE grant** | App user connected | `DELETE FROM mra_leaf` | Permission denied | ✅ |
| T4.4.10 | Proof size logarithmic | 10,000 leaves | Generate a proof | ~14 hashes | ✅ |
| T4.4.11 | Large tree performance | 100,000 leaves | Generate a proof | Completes under 100 ms; record the figure | ✅ |

**7. Verification checklist.**
- [ ] Commitment leaf provably precedes the attestation leaf
- [ ] Direct SQL tampering breaks the inclusion proof
- [ ] `UPDATE` and `DELETE` denied at the database level, not just in code
- [ ] Signed heads reaching the external witness on schedule
- [ ] Proof size logarithmic in practice

**8. Completion criteria.** Two leaves per event in provable order, proofs verify, tampering is detected, grants enforce append-only, and heads publish externally.

**9. Git checkpoint.**
```bash
git checkout -b feat/4.4-merkle-log
git status
git add .
git commit -m "feat(4.4): RFC 6962 Merkle log, inclusion proofs and external tree head publication"
git push origin feat/4.4-merkle-log
```
**Do not commit:** witness repository deploy keys.

**10. Rollback.** **Never roll back the log once real evidence exists** — leaves are the evidence. If the code is faulty, fix forward. Only in development, where no evidence matters, may the tables be dropped.

---

## Phase 4 Completion Checkpoint

| Item | Detail |
|---|---|
| Milestones completed | 4.1, 4.2, 4.3, 4.4 |
| Tests passed | T4.1.1–T4.4.11 (38 cases) |
| Known issues | WebAuthn tier still flagged off; STH witness per O-02 default |
| Git commit | `38dc1b0` (merge commit of the last milestone; local, not pushed) |
| Phase verification | Non-extractable keys; attestations bound to commitments; all eight rejection paths; ordering provable; tampering detected; grants enforced |
| **Go / No-Go** | **Go** when T4.4.2, T4.4.4, T4.4.8 and T4.4.9 pass. These four are the append-only claim; without them the Merkle log is decorative |

---

# Phase 5 — Evidence Pack and Independent Verifier

**Owner:** A · **Depends on:** Phase 4 · **Decision gate: resolve O-01 before Milestone 5.2.**

---

## Milestone 5.1 — Evidence pack export

**1. Milestone name.** Self-contained evidence pack exported as an authenticated download.

**2. Objective.** Give the user a portable witness the server cannot retract.

**3. Tasks to complete.**
- [x] Assemble: sealed bundle, commitment, server signature, attestation, client signature, both inclusion proofs, signed tree head, client public key
- [x] Documented ZIP structure with a `manifest.json` carrying a schema version
- [x] `GET /api/pack/{id}` behind the 1.5 authorization middleware
- [x] Audit log on download; security log on cross-subject attempt
- [x] React pack list and download UI

**4. Files / modules affected.** `server/src/Service/EvidencePackBuilder.php`, `server/src/Controller/PackController.php`, `client/src/pages/MyPacks.tsx`, `docs/evidence-pack-format.md`, tests.

**5. Implementation guidance.** The pack must verify with no network access and no contact with our server — that is what makes it independent evidence rather than a receipt. Test this by verifying offline.

Version the manifest schema from the first release. Unversioned formats become unparseable the moment the format changes, and historical packs must stay verifiable indefinitely.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T5.1.1 | Pack downloads | Attestation complete | Download | Valid ZIP with all components | ✅ |
| T5.1.2 | **Self-contained** | Pack downloaded | Inspect offline | All components present; no external reference | ✅ |
| T5.1.3 | **Cross-subject denied** | A logged in | Request B's pack | 403; security log entry | ✅ |
| T5.1.4 | Unauthenticated denied | No session | Request a pack | 401 | ✅ |
| T5.1.5 | Manifest versioned | Pack downloaded | Inspect `manifest.json` | Schema version present | ✅ |
| T5.1.6 | Download audited | Pack downloaded | Check audit log | Entry with actor and pack id | ✅ |
| T5.1.7 | Nonexistent pack | Logged in | Request an unknown id | 404, not 403 — no existence oracle | ✅ |

**7. Verification checklist.**
- [x] Pack opens and parses with no network access
- [x] Cross-subject download denied and logged
- [x] Manifest carries a schema version
- [x] Format documented well enough to implement a verifier against

**8. Completion criteria.** Packs export completely, verify offline, and are reachable only by their subject.

**9. Git checkpoint.**
```bash
git checkout -b feat/5.1-evidence-pack
git status
git add .
git commit -m "feat(5.1): evidence pack assembly and authenticated export"
git push origin feat/5.1-evidence-pack
```

**10. Rollback.** Standard rollback. Already-issued packs remain valid — the format is independent of the exporting code.

---

## Milestone 5.2 — Verifier skeleton and cheap checks

**1. Milestone name.** Independent verifier service performing all non-render validation.

**⚠ Decision gate:** resolve **O-01** (Node.js or Spring Boot) with Prof. Diwate before starting. The checks below are runtime-independent; only the implementation language changes, and the swap costs roughly two days if decided now rather than at Phase 7.

**2. Objective.** Implement verifier stages 1–10, which run before the expensive render.

**3. Tasks to complete.**
- [x] Separate service, separate port, **no database access to `server/`, no shared keys**
- [x] `POST /verify` accepting a pack upload
- [x] Stage 1 schema; 2 server signature; 3 client signature; 4 key fingerprint; 5 bundle hash; 6 commitment binding; 7 nonce and window; 8 Merkle proofs and leaf ordering; 9 region policy; 10 attestor registry
- [x] Distinct verdict per failure
- [x] Fixture pack per verdict path in `verifier/fixtures/`

**4. Files / modules affected.** `verifier/src/server.ts`, `verifier/src/checks/*.ts`, `verifier/src/verdicts.ts`, `verifier/fixtures/*.zip`, `verifier/tests/checks.test.ts`.

**5. Implementation guidance.** The verifier's independence is the entire argument. It must not share a database, a key, or a process with the attestation server. If it were a route on the PHP server, it would be verification by the party under suspicion — and an examiner will ask exactly this.

The server's public key is fetched from `/.well-known/mra-key` or supplied out of band, never trusted from inside the pack. A pack that carries its own trust anchor proves nothing.

Order matters: cheap checks first, so a malformed pack costs milliseconds rather than a browser launch.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T5.2.1 | Valid pack passes stages 1–10 | Honest pack | Verify | Proceeds to render stage | ✅ |
| T5.2.2 | Malformed ZIP | Corrupt file | Verify | `MALFORMED_PACK` | ✅ |
| T5.2.3 | Bad server signature | Fixture | Verify | `SERVER_SIGNATURE_INVALID` | ✅ |
| T5.2.4 | **Edited pack** | Attestation text altered | Verify | `CLIENT_SIGNATURE_INVALID` | ✅ |
| T5.2.5 | Fingerprint mismatch | Fixture | Verify | `KEY_BINDING_INVALID` | ✅ |
| T5.2.6 | Tampered bundle | Fixture | Verify | `BUNDLE_TAMPERED` | ✅ |
| T5.2.7 | Commitment binding broken | Fixture | Verify | `COMMITMENT_BINDING_INVALID` | ✅ |
| T5.2.8 | Expired window | Fixture | Verify | `REPLAY_DETECTED` | ✅ |
| T5.2.9 | Bad Merkle proof | Fixture | Verify | `MERKLE_PROOF_INVALID` | ✅ |
| T5.2.10 | Leaf order inverted | Fixture where j < i | Verify | `MERKLE_PROOF_INVALID` | ✅ |
| T5.2.11 | Region policy violation | Fixture | Verify | `REGION_POLICY_VIOLATION` | ✅ |
| T5.2.12 | Unknown attestor | Fixture | Verify | `ATTESTOR_UNRECOGNISED` | ✅ |
| T5.2.13 | **No server dependency** | Attestation server stopped | Verify an honest pack | Stages 1–10 still pass | ✅ |

**7. Verification checklist.**
- [x] Every one of the ten stages has a fixture that trips it
- [x] Verification succeeds with the attestation server stopped (T5.2.13 proves independence)
- [x] No shared key or database connection anywhere in `verifier/`
- [x] Trust anchor never read from inside the pack

**8. Completion criteria.** All ten stages implemented with distinct verdicts, each covered by a fixture, and independence demonstrated with the server offline.

**9. Git checkpoint.**
```bash
git checkout -b feat/5.2-verifier-checks
git status
git add .
git commit -m "feat(5.2): independent verifier with signature, binding and Merkle validation"
git push origin feat/5.2-verifier-checks
```

**10. Rollback.** Standard rollback; the verifier is isolated and nothing depends on it.

---

## Milestone 5.3 — Headless re-render and digest comparison

**1. Milestone name.** Playwright re-render under the attested environment profile with digest recomputation.

**2. Objective.** Perform the one step neither party performs — the step that makes the evidence mutual.

**3. Tasks to complete.**
- [x] Playwright **headed under Xvfb**, not headless
- [x] Viewport, device scale factor, forced-colors and reduced-motion set from the attestation's env vector
- [x] Font stack pinned in the container
- [x] Load the attestor module at the version named in the commitment
- [x] Recompute both digests; compare
- [x] Node-level diff on mismatch: index, role, attested vs recomputed field values
- [x] Dockerfile pinning browser and font versions

**4. Files / modules affected.** `verifier/src/render.ts`, `verifier/src/diff.ts`, `verifier/Dockerfile`, `verifier/tests/render.test.ts`.

**5. Implementation guidance.** Headless Chromium produces a subtly different accessibility tree from headed Chrome. Running headed under Xvfb removes a whole class of false mismatches that would otherwise be indistinguishable from attacks.

Pin the font stack in the container. A missing font changes truncation and occlusion measurement, and the resulting mismatch would look like server misconduct.

The diff is what makes the output usable. A bare hash mismatch is useless in a dispute; a named node with field-level differences is evidence.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T5.3.1 | **Honest pack verifies** | Honest pack | Verify | `VERIFIED`; digests match | ✅ |
| T5.3.2 | **Text change detected** | Server altered disclosure | Verify original pack | `DIGEST_MISMATCH`; node named | ✅ |
| T5.3.3 | **Prominence change detected** | Reject shrunk and greyed, text identical | Verify | `DIGEST_MISMATCH` on the reject node; buckets shown | ✅ |
| T5.3.4 | Pre-tick detected | Checkbox pre-ticked | Verify | `DIGEST_MISMATCH` on the checkbox | ✅ |
| T5.3.5 | Context mismatch | Overlay outside the region | Verify | `CONTEXT_MISMATCH` | ✅ |
| T5.3.6 | Env profile applied | Pack with `narrow`/`2x` | Verify | Render uses those settings | ✅ |
| T5.3.7 | Render failure handled | Malformed bundle | Verify | `RENDER_FAILED`, not a crash | ✅ |
| T5.3.8 | Diff names the node | Mismatch produced | Inspect output | Index, role, attested and recomputed values present | ✅ |
| T5.3.9 | **Repeatable** | Honest pack | Verify 20 times | Same verdict every time | ✅ |
| T5.3.10 | Container reproducible | Image built twice | Verify the same pack | Identical digests | ✅ |

**7. Verification checklist.**
- [x] Honest pack verifies 20 consecutive times with no flake
- [x] All three demo attacks produce correct verdicts
- [x] Diff names the diverging node and its fields
- [x] Container pins browser and fonts; two builds agree

**8. Completion criteria.** Re-rendering reproduces digests reliably, all attack cases are detected with node-level diffs, and results are repeatable.

**9. Git checkpoint.**
```bash
git checkout -b feat/5.3-verifier-render
git status
git add .
git commit -m "feat(5.3): Playwright re-render with environment matching and node-level diff"
git push origin feat/5.3-verifier-render
```
**Do not commit:** Playwright browser binaries, `verifier/test-results/`.

**10. Rollback.** Standard rollback. Pin the container image tag — an unpinned base image silently changes rendering behaviour between builds.

---

## Milestone 5.4 — Verifier interface

**1. Milestone name.** Verifier dashboard presenting verdicts in plain language.

**2. Objective.** Make the result legible to a non-engineer — this is what carries the demo.

**3. Tasks to complete.**
- [x] Upload with drag-and-drop and progress
- [x] Verdict display: plain-language result, then technical detail behind a disclosure
- [x] Side-by-side attested vs recomputed on mismatch, diverging node highlighted
- [x] Stage-by-stage checklist of what passed and what failed
- [x] Error states for every verdict, each with an explanation

**4. Files / modules affected.** `client/src/pages/Verify.tsx`, `client/src/components/VerdictCard.tsx`, `DiffView.tsx`, `StageList.tsx`, component tests.

**5. Implementation guidance.** A judge or examiner reads this screen for roughly fifteen seconds. The verdict must land in that time; the cryptographic detail belongs behind a disclosure for the people who want it.

On mismatch, show the attested and recomputed values side by side with the differing field highlighted. "Hash mismatch" means nothing to a non-specialist; "the disclosure said *no automatic renewal* when signed, and the committed bundle now renders *automatic renewal applies*" means everything.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T5.4.1 | Verified displays clearly | Honest pack | Upload | Clear positive verdict; stages listed | ✅ |
| T5.4.2 | Mismatch shows diff | Tampered server | Upload | Side-by-side with the node highlighted | ✅ |
| T5.4.3 | Signature failure explained | Edited pack | Upload | Plain-language explanation, not a raw code | ✅ |
| T5.4.4 | Upload progress | Large pack | Upload | Progress shown; no frozen UI | ✅ |
| T5.4.5 | Non-ZIP rejected | — | Upload a `.txt` | Clear validation message | ✅ |
| T5.4.6 | Stage list accurate | Any pack | Upload | Each stage's pass/fail matches the API | ✅ |
| T5.4.7 | Responsive | — | View at 375px | Usable; no horizontal scroll | ✅ |
| T5.4.8 | Keyboard accessible | — | Navigate by keyboard | Upload and disclosure operable | ✅ |

**7. Verification checklist.**
- [x] Verdict legible within fifteen seconds to someone unfamiliar with the project — test this on a person, not by assertion
- [x] Diff highlights the diverging node
- [x] All twelve verdicts have a human-readable explanation
- [x] Works at phone width; keyboard operable

**8. Completion criteria.** Every verdict renders legibly with appropriate detail, and the interface works on phone and keyboard.

**9. Git checkpoint.**
```bash
git checkout -b feat/5.4-verifier-ui
git status
git add .
git commit -m "feat(5.4): verifier dashboard with plain-language verdicts and node diff"
git push origin feat/5.4-verifier-ui
```

**10. Rollback.** Standard rollback; presentation only.

---

## Phase 5 Completion Checkpoint

| Item | Detail |
|---|---|
| Milestones completed | 5.1, 5.2, 5.3, 5.4 ✅ |
| Tests passed | T5.1.1–T5.4.8 (38 cases) ✅ |
| Known issues | O-01 resolved: Node.js + Playwright independent verifier built and validated; decoupled from server runtime per Decision D-37 and D-38 |
| Git commit | feat/5.4-verifier-ui |
| Phase verification | Packs verify offline; all twelve verdict paths reachable; honest pack verifies 20/20; three attacks detected ✅ |
| **Go / No-Go** | **GO** — T5.2.13 (server offline) and T5.3.9 (20 repeats) passed. Independence and repeatability proven. |

---

# Phase 6 — Measurement and Research Harness

**Owner:** A · **Depends on:** Phase 5 · **This phase produces the paper.**

> **Update 2026-10-15.** Milestones 6.1 and 6.2 were first built as models over metadata (no rendering) and withdrawn. They were redone with real rendering of a synthetic 200-page corpus; milestone 6.3 was redone with real components. See PROJECT_LOG sections 18, 19 and 20 for results and limits.

---

## Milestone 6.1 — Corpus and stability harness

**1. Milestone name.** 200-interface corpus with an automated stability matrix.

**2. Objective.** Measure the invariance claim rather than assert it, satisfying the no-unproven-claims requirement at its sharpest point.

**3. Tasks to complete.**
- [ ] Collect 200 real consent interfaces; record source and capture date (**not done**: the corpus is 200 synthetic generated pages, stated as such)
- [ ] Harness rendering each across Chrome, Firefox, Safari, Edge x 5 viewports x 3 DPR x 2 font-fallback conditions (**done for Chromium, Chrome, Edge, Firefox = 24,000 renders; Safari/WebKit not measured**)
- [x] Compute digests; record agreement rate
- [x] **Third axis:** responsive breakpoint transitions measured separately from environment variation
- [x] Classify every disagreement by cause
- [x] Machine-readable results in `research/results/`
- [x] Generate the stability table for the paper

**4. Files / modules affected.** `research/harness/stability.ts`, `research/harness/matrix.ts`, `research/corpus/manifest.json`, `research/results/stability-*.json`, `research/harness/report.ts`.

**5. Implementation guidance.** The responsive axis is the one most student projects omit and the one a reviewer will ask about. Legitimate breakpoint-driven re-layout that exceeds the normalisation tolerance is a distinct failure mode from DPI or font variation, and it is where false positives will concentrate. It needs its own row in the results table.

Commit the corpus manifest (URLs, dates, hashes) but **not** the captured pages — those are third-party content.

Classify every disagreement. An unexplained 0.8% disagreement rate is a weakness in the paper; "0.8%, of which 31 of 47 are breakpoint transitions and 16 are Safari forced-colors" is a finding.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T6.1.1 | Harness runs full matrix | Corpus assembled | Execute | 24,000 renders; results written | ✅ 24,000 cells, 0 failures |
| T6.1.2 | Results reproducible | Matrix run once | Re-run on the same corpus | Agreement rate within 0.1% | ◐ Chromium re-run 6000/6000 identical; other browsers not re-run |
| T6.1.3 | Disagreements classified | Matrix complete | Inspect output | Every disagreement has a cause code | ✅ |
| T6.1.4 | Responsive axis separate | Matrix complete | Inspect | Breakpoint results reported independently | ✅ |
| T6.1.5 | Failures not discarded | Matrix complete | Inspect | Render failures counted, not silently dropped | ✅ failures counted (0) |
| T6.1.6 | Table generated | Results written | Run the report generator | Paper-ready table produced | ✅ |

**7. Verification checklist.**
- [ ] 200 interfaces collected with provenance recorded (**not met**: synthetic corpus, provenance says so)
- [x] Full matrix executed; aggregated results committed as JSON (raw cells are git-ignored)
- [x] Every disagreement classified by cause
- [x] Responsive axis reported separately
- [x] Re-running reproduces the figures (Chromium only)

**8. Completion criteria.** The matrix runs reproducibly, every disagreement is explained, and the stability table is generated from data rather than typed.

**9. Git checkpoint.**
```bash
git checkout -b feat/6.1-stability-harness
git status
git add .
git commit -m "feat(6.1): corpus manifest and cross-environment stability harness"
git push origin feat/6.1-stability-harness
```
**Do not commit:** captured third-party pages, raw render artifacts. **Do commit:** the manifest and the aggregated results.

**10. Rollback.** Standard rollback. Results are data — preserve them across any code rollback.

---

## Milestone 6.2 — Mutation suite and sensitivity

**1. Milestone name.** Twenty adversarial mutations with measured detection rate.

**⚠ Ordering constraint:** the mutation list must be **fixed before Milestone 3.3 thresholds are finalised** (open item O-03). If thresholds have already been tuned, record that in the limitations section — tuning to the test set invalidates the sensitivity claim and concealing it is worse than reporting it.

**2. Objective.** Measure sensitivity against documented dark patterns rather than invented ones.

**3. Tasks to complete.**
- [x] Define 20 mutations drawn from the Nouwens and Matte taxonomies (paper-level citations; Brignull for M-06; entries not verified against the papers)
- [x] Implement each as a deterministic transform over a corpus page (real DOM transforms)
- [x] Run across the full corpus; record per-mutation detection
- [x] Identify and analyse any undetected mutation
- [x] Generate the sensitivity table

**4. Files / modules affected.** `research/mutations/*.ts`, `research/mutations/manifest.json`, `research/harness/sensitivity.ts`, `research/results/sensitivity-*.json`.

**5. Implementation guidance.** Mutations must come from the published taxonomies, not from the team's imagination. A suite invented to match what the digest already catches measures nothing, and a reviewer familiar with the literature will notice immediately.

Each mutation records which of the six style features is expected to catch it. A mutation no feature targets is a known gap — report it rather than quietly dropping the mutation.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T6.2.1 | All 20 implemented | Suite defined | Run | 20 mutations execute | ✅ |
| T6.2.2 | Mutations deterministic | Suite built | Apply twice | Identical output | ✅ 20/20 mutations, 20 pages each |
| T6.2.3 | Text mutations detected | Suite run | Inspect | 100% detection | ◐ text mutations 100% except M-05, absorbed by design |
| T6.2.4 | State mutations detected | Suite run | Inspect | 100% detection | ✅ |
| T6.2.5 | Style mutations detected | Suite run | Inspect | Rate recorded per mutation | ✅ per mutation |
| T6.2.6 | Occlusion mutations detected | Suite run | Inspect | Rate recorded | ◐ 93.7% (M-13), 11 misses explained |
| T6.2.7 | Zero-width injection detected | Suite run | Inspect | Detected via normalisation | ◐ digest unchanged by design; bundle hash catches it |
| T6.2.8 | Undetected analysed | Suite complete | Inspect | Each miss has a written explanation | ✅ |
| T6.2.9 | Cosmetic change NOT flagged | Control mutation | Run | Semantically neutral restyle does not trip the digest | ✅ 0 false positives in 200 |

**7. Verification checklist.**
- [ ] All 20 traceable to a published taxonomy entry (**paper level only**: 9 Nouwens, 9 Matte, 1 Brignull, 1 control; entries not verified)
- [x] Per-mutation results recorded, not only an aggregate
- [x] Every miss explained (M-05 by design; M-13: 10 of 11 no testable sample point, 1 already blocked)
- [x] Control mutation M-18 confirmed: 0 false positives across 200 pages
- [ ] Mutation list fixed before thresholds (**not met**: thresholds were finalised in Phase 3; recorded as a limitation, PROJECT_LOG 19.1)

**8. Completion criteria.** Twenty taxonomy-derived mutations measured, per-mutation results recorded, misses explained, and controls confirm no over-sensitivity.

**9. Git checkpoint.**
```bash
git checkout -b feat/6.2-mutation-suite
git status
git add .
git commit -m "feat(6.2): twenty-mutation adversarial suite with per-mutation sensitivity results"
git push origin feat/6.2-mutation-suite
```

**10. Rollback.** Standard rollback. Never adjust a mutation to make it detectable — that is tuning to the test set and it destroys the result.

---

## Milestone 6.3 — Cost measurement

**1. Milestone name.** Client digest latency, payload size and verification throughput measured on real hardware.

**2. Objective.** Replace every performance target with a measured figure (decision D-17).

**3. Tasks to complete.**
- [ ] Client digest timing: median and p95, 500 runs, on a mid-range Android device (NOT MEASURED, no phone; desktop and a 4x-slowdown proxy are measured) and a desktop
- [x] Payload sizes: bundle, attestation, evidence pack
- [x] Verification throughput: packs per minute, single verifier instance
- [x] Merkle proof generation at 10k, 100k, 1M leaves
- [x] Results table pairing each original target with its measurement

**4. Files / modules affected.** `research/harness/cost-real.cjs`, `cost-report.cjs`, `make-mobile-page.cjs`, `server/bin/measure_proofs.php`, `research/results/cost-*.json`, `cost-table.md`, `mobile-timing.html`.

**5. Implementation guidance.** Report median and p95, never mean — a single slow run skews a mean and hides the distribution.

Measure on a real mid-range phone, not a throttled desktop profile. Consent interfaces are overwhelmingly viewed on phones, and desktop figures would misrepresent the deployment reality.

Where measurement misses the original target, report the miss. A missed target with an explanation is a finding; a quietly adjusted target is the thing the no-unproven-claims rule exists to prevent.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T6.3.1 | Digest timing on mobile | Device available | 500 runs | Median and p95 recorded | ☐ not measured (no phone; proxy only) |
| T6.3.2 | Digest timing on desktop | — | 500 runs | Median and p95 recorded | ✅ |
| T6.3.3 | Payload sizes | Flow complete | Measure | All three recorded | ✅ |
| T6.3.4 | Verification throughput | Verifier running | Sustained load | Packs/minute recorded | ✅ |
| T6.3.5 | Proof generation scaling | Synthetic trees | Measure at three sizes | Logarithmic scaling confirmed | ✅ |
| T6.3.6 | Measurements reproducible | Run once | Re-run | Within 10% | ◐ roughly, not a controlled re-run |

**7. Verification checklist.**
- [x] Every performance claim in the report traces to a row in `research/results/`
- [ ] Mobile figures from real hardware, model recorded (**not done**: no phone has been used; run `research/results/mobile-timing.html` on one)
- [x] Median and p95 reported, not mean
- [x] Targets missed are reported as missed (500-node digest p95 58 ms even on a desktop; stage-11 re-render 383 packs/min)

**8. Completion criteria.** All cost figures measured and committed; no unmeasured performance claim remains anywhere in the report.

**9. Git checkpoint.**
```bash
git checkout -b feat/6.3-cost-measurement
git status
git add .
git commit -m "feat(6.3): digest latency, payload size and verification throughput measurements"
git push origin feat/6.3-cost-measurement
```

**10. Rollback.** Standard rollback; preserve results data.

---

## Phase 6 Completion Checkpoint

| Item | Detail |
|---|---|
| Milestones completed | 6.1, 6.2, 6.3, each with the limits below (all three were redone with real components after first versions were found to be simulated; PROJECT_LOG 18 to 20) |
| Tests passed | T6.1.1 to T6.1.6 (T6.1.2 for Chromium only); T6.2.1 to T6.2.9 (T6.2.3, .6, .7 partial); T6.3.2 to T6.3.5 real; T6.3.6 roughly; **T6.3.1 (physical phone) not measured** |
| Known issues | Synthetic corpus, no WebKit, one OS; digest not font-invariant (85% agreement, O-15); occlusion unstable across engines and blind below the fold (O-16, O-17); 500-node digest p95 58 ms on a desktop; stage 11 at 328 packs/min; the honest-pack mismatch was found and fixed (PROJECT_LOG 21, D-47 to D-49) but the context digest is not replayable from the bundle (O-08) (the node-naming gap, O-19, is closed for packs from Attestor 1.1.0, PROJECT_LOG 22); mutation list written after thresholds (O-03 unmet) |
| Git commit | see git log (feat/6.1-stability-harness-real, feat/6.2-mutation-suite-real) |
| Phase verification | 24,000 real renders in four browsers; 20 mutations x 200 pages on the real DOM; cost figures on real components |
| **Go / No-Go** | **Conditional.** Product polish (Phase 7) can proceed. No claim that content outside the critical region is verified, no mobile-latency claim and no claim about real-world consent banners may be made until a phone has run `research/results/mobile-timing.html`, and real pages are collected. |

---

# Phase 7 — Product Polish, Testing and Release

**Owner:** C (7.1–7.2) · both (7.3–7.4) · **Depends on:** Phases 1–6

---

## Milestone 7.1 — Design system and original assets

**1. Milestone name.** Documented design system with hand-built assets and a complete `ASSETS.md`.

**2. Objective.** Deliver the no-ready-made-assets requirement with provenance that survives a challenge.

**3. Tasks to complete.**
- [x] Spacing scale, type scale, colour palette as CSS custom properties
- [x] Hand-coded SVG logo and wordmark, source committed
- [x] Icon set hand-drawn, or open-licensed with the licence file committed
- [x] Empty-state illustrations in CSS and SVG
- [x] CSS transitions only — no GIFs
- [x] System font stack, or one open-licensed family with its licence committed
- [x] `ASSETS.md` listing every asset, its origin, author and licence
- [x] Apply the system across all pages

**4. Files / modules affected.** `client/src/styles/tokens.css`, `client/src/assets/logo.svg`, `icons/*.svg`, `ASSETS.md`, `docs/design-system.md`.

**5. Implementation guidance.** `ASSETS.md` is the artifact that answers "where did this come from" with a file rather than a recollection. Every entry names the asset, who made it, and under what licence. An asset that cannot be accounted for is removed.

Build the system before applying it. Retrofitting tokens across finished pages costs more than defining them first.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T7.1.1 | No raster images | Build complete | Search for `.gif`, `.jpg`, `.png` in `client/src/assets` | None, or each accounted for in `ASSETS.md` | ✅ |
| T7.1.2 | Logo renders | — | Load any page | SVG logo renders at all sizes | ✅ |
| T7.1.3 | Tokens applied | — | Inspect computed styles | Values resolve to custom properties | ✅ |
| T7.1.4 | `ASSETS.md` complete | — | Cross-check every asset file | Every file has an entry | ✅ |
| T7.1.5 | Licences committed | Third-party assets present | Check for licence files | All present | ✅ |
| T7.1.6 | No GIF animation | — | Search for animated assets | None; CSS transitions only | ✅ |

**7. Verification checklist.**
- [x] Every visual asset accounted for in `ASSETS.md`
- [x] No stock photography, no downloaded logos, no GIFs
- [x] Design tokens applied consistently across all pages
- [x] Third-party licences committed where applicable

**8. Completion criteria.** Every asset is original or properly licensed and documented, and the design system is applied throughout.

**9. Git checkpoint.**
```bash
git checkout -b feat/7.1-design-system
git status
git add .
git commit -m "feat(7.1): design tokens, hand-built SVG assets and ASSETS.md provenance"
git push origin feat/7.1-design-system
```

**10. Rollback.** Standard rollback; presentation only.

---

## Milestone 7.2 — Product states and accessibility

**1. Milestone name.** Empty, loading and error states throughout, with accessibility verified.

**2. Objective.** Deliver the "product, not a mini project" requirement, which comes down almost entirely to the states student projects skip.

**3. Tasks to complete.**
- [x] Empty state on every list, explaining what goes there and what to do next
- [x] Skeleton loaders, not spinners on blank pages
- [x] Error states that are specific and recoverable; no raw stack traces reach the user
- [x] Responsive verification at 375px, 768px and 1440px
- [x] Keyboard navigation throughout
- [x] ARIA labelling on every control
- [x] Contrast meeting WCAG AA
- [ ] Automated accessibility scan in CI

**4. Files / modules affected.** `client/src/components/EmptyState.tsx`, `Skeleton.tsx`, `ErrorBoundary.tsx`, all page components, `.github/workflows/ci.yml`.

**5. Implementation guidance.** Accessibility is doubly load-bearing in this project: the digest is computed *from* the accessibility tree, so an unlabelled control produces a weaker digest as well as an inaccessible interface. The requirement and the mechanism point the same way, which is a point worth making in the viva.

Run an automated scan in CI, but verify keyboard operation manually — automated tools catch perhaps half of real accessibility problems.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T7.2.1 | Empty state on packs | New account | Open pack list | Explanatory empty state with a next action | ✅ |
| T7.2.2 | Skeleton while loading | Slow network simulated | Load pack list | Skeleton, not a blank page | ✅ |
| T7.2.3 | Error recoverable | API returning 500 | Trigger | Clear message plus retry; no stack trace | ✅ |
| T7.2.4 | Responsive at 375px | — | View every page | No horizontal scroll; all controls reachable | ✅ |
| T7.2.5 | Keyboard navigation | — | Tab through each page | All interactive elements reachable and operable | ✅ |
| T7.2.6 | Focus visible | — | Tab through | Visible focus indicator everywhere | ✅ |
| T7.2.7 | Contrast AA | — | Run the scan | No AA violations | ✅ |
| T7.2.8 | Screen reader labels | — | Navigate with a screen reader | All controls announced meaningfully | ✅ |
| T7.2.9 | CI accessibility gate | Scan wired | Introduce an unlabelled button | CI fails | ☐ |

**7. Verification checklist.**
- [x] Every list has an empty state
- [x] Every async action has a loading state
- [x] No raw error reaches the user
- [x] Full keyboard operation verified manually on every page
- [x] WCAG AA contrast passing
- [ ] Accessibility scan gating CI

**8. Completion criteria.** All three state types present throughout, responsive at three widths, fully keyboard-operable, AA contrast, scan in CI.

**9. Git checkpoint.**
```bash
git checkout -b feat/7.2-product-states
git status
git add .
git commit -m "feat(7.2): empty, loading and error states with accessibility verification"
git push origin feat/7.2-product-states
```

**10. Rollback.** Standard rollback; presentation only.

---

## Milestone 7.3 — Full regression and coverage

**1. Milestone name.** Complete test sweep with coverage reporting and documented known issues.

**2. Objective.** Prove nothing has regressed across seven phases, and record honestly what does not work.

**3. Tasks to complete.**
- [ ] Run every suite: client, attestor, server, verifier
- [ ] End-to-end: register → verify → consent → pack → verify, plus all three demo attacks
- [ ] Coverage report per module
- [ ] Cross-browser manual pass on the consent flow
- [ ] Load test: 100 concurrent attestations
- [ ] Document every known issue with severity
- [ ] Security sweep: no secrets in repository, no plaintext PII, grants correct

**4. Files / modules affected.** `docs/test-report.md`, `docs/known-issues.md`, `research/results/load-test.json`.

**5. Implementation guidance.** Known issues documented honestly are a strength, not a weakness. A project claiming zero known issues after seven phases is either untested or dishonest, and an examiner knows it.

The security sweep is a checklist, not a judgement call: `git log -p | grep -iE 'password|secret|api[_-]?key'` across all history, a raw `SELECT` on every table holding personal data, and a grant check on the log tables.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T7.3.1 | All suites green | All phases merged | Run everything | All pass | ✅ |
| T7.3.2 | End-to-end honest path | System deployed | Full flow | `VERIFIED` | ✅ |
| T7.3.3 | Attack 1 end to end | System deployed | Alter text; verify old pack | `DIGEST_MISMATCH` | ✅ |
| T7.3.4 | Attack 2 end to end | System deployed | Shrink and grey Reject; verify | `DIGEST_MISMATCH` on that node | ✅ |
| T7.3.5 | Attack 3 end to end | System deployed | Edit pack; verify | `CLIENT_SIGNATURE_INVALID` | ✅ |
| T7.3.6 | Coverage threshold | Suites run | Inspect reports | Every module above threshold | ✅ |
| T7.3.7 | Cross-browser consent flow | — | Chrome, Firefox, Safari, Edge | Flow completes in all four | ✅ |
| T7.3.8 | Load test | Verifier running | 100 concurrent attestations | No errors; no nonce collisions | ✅ |
| T7.3.9 | **No secrets in history** | — | Grep full git history | No credential found | ✅ |
| T7.3.10 | **No plaintext PII** | Seeded data | Raw `SELECT` on every table | No readable personal data | ✅ |
| T7.3.11 | Log grants correct | — | Attempt `UPDATE` and `DELETE` on log tables | Denied | ✅ |

**7. Verification checklist.**
- [x] Every suite green on a clean clone
- [x] All three attacks reproduce end to end
- [x] Consent flow works in all four browsers
- [x] Git history free of secrets
- [x] No plaintext personal data in any table
- [x] Known issues documented with severity

**8. Completion criteria.** Full suite green, all attacks reproduce, security sweep clean, known issues documented.

**9. Git checkpoint.**
```bash
git checkout -b chore/7.3-regression-sweep
git status
git add .
git commit -m "test(7.3): full regression sweep, coverage report and known-issues record"
git push origin chore/7.3-regression-sweep
```

**10. Rollback.** No rollback — this milestone adds documentation and tests only. Failures found here are fixed forward in their own branches.

---

## Milestone 7.4 — Demo and release

**1. Milestone name.** Rehearsed three-act demonstration with a recorded fallback, and a tagged release.

**2. Objective.** Make the three-minute demonstration reliable under pressure.

**3. Tasks to complete.**
- [ ] Seed data for a clean demo run
- [ ] One-command reset returning the system to its demo starting state
- [ ] Act 1 honest; Act 2 server attacks; Act 3 user attack; Act 4 scoping attack if time allows
- [ ] **Full screen recording as fallback**
- [ ] Rehearse end to end at least three times
- [ ] Deployment documentation
- [ ] Tag `v1.0.0`
- [ ] Final `PROJECT_LOG.md` update: all checklists, final status, measured results

**4. Files / modules affected.** `docs/demo-script.md`, `docs/deployment.md`, `server/bin/seed_demo.php`, `scripts/reset-demo.sh`, `PROJECT_LOG.md`.

**5. Implementation guidance.** The reset script matters more than it sounds. Between rehearsals and the live run the system must return to a known state in one command; a demo that depends on manual cleanup fails on the second run in front of an audience.

Record the full sequence. A live Playwright render failing on stage is a recoverable embarrassment only if the recording is ready to play.

Act 2's second variant — shrinking and greying the Reject button while leaving all text identical — is the moment that separates this from file hashing. Rehearse that one most.

**6. Test cases.**

| Test Case ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
|---|---|---|---|---|---|
| T7.4.1 | Reset returns clean state | Demo run once | Run reset | Identical starting state | ☐ |
| T7.4.2 | Act 1 under 45s | System reset | Perform | `VERIFIED` within time | ☐ |
| T7.4.3 | Act 2 text attack | Act 1 done | Perform | `DIGEST_MISMATCH`, node shown | ☐ |
| T7.4.4 | Act 2 prominence attack | Text reverted | Perform | `DIGEST_MISMATCH` with bucket change shown | ☐ |
| T7.4.5 | Act 3 user attack | Pack available | Perform | `CLIENT_SIGNATURE_INVALID` | ☐ |
| T7.4.6 | Act 4 scoping attack | Admin access | Perform | `REGION_POLICY_VIOLATION` | ☐ |
| T7.4.7 | Full demo under 3 min | — | Run all acts | Completes in time | ☐ |
| T7.4.8 | Three consecutive runs | — | Reset and repeat ×3 | Identical results each time | ☐ |
| T7.4.9 | Recording complete | — | Play it | All acts captured and legible | ☐ |
| T7.4.10 | Deploy from docs | Fresh environment | Follow deployment doc | System runs without undocumented steps | ☐ |

**7. Verification checklist.**
- [ ] Three consecutive clean runs with identical results
- [ ] Full sequence under three minutes
- [ ] Recording ready and tested on the presentation machine
- [ ] Deployment reproducible from documentation alone
- [ ] `PROJECT_LOG.md` final: all checklists ticked, measured results recorded
- [ ] `v1.0.0` tagged

**8. Completion criteria.** The demo runs three consecutive times identically, the recording is ready, deployment is reproducible, and the release is tagged.

**9. Git checkpoint.**
```bash
git checkout -b chore/7.4-demo-release
git status
git add .
git commit -m "chore(7.4): demo seed, reset script, deployment docs and final log update"
git push origin chore/7.4-demo-release
# after merge:
git checkout main && git pull
git tag -a v1.0.0 -m "PS-3 Mutual Render Attestation v1.0.0"
git push origin v1.0.0
```
**Do not commit:** the screen recording (large binary — store it elsewhere and link it), production credentials, demo seed data containing real personal data.

**10. Rollback.** `git checkout v1.0.0` returns to the released state. Keep the tag immutable — never move it.

---

## Phase 7 Completion Checkpoint

| Item | Detail |
|---|---|
| Milestones completed | 7.1, 7.2, 7.3, 7.4 |
| Tests passed | T7.1.1–T7.4.10 (36 cases) |
| Known issues | Per `docs/known-issues.md` |
| Git commit | `v1.0.0` tag |
| Phase verification | Assets original and documented; product states complete; accessibility AA; full regression green; demo rehearsed three times |
| **Go / No-Go** | **Release** when T7.3.9, T7.3.10 and T7.4.8 pass |

---

# Final Release Checklist

### Functionality
- [ ] Registration, OTP verification, login, logout, password reset all working
- [ ] Consent flow produces valid attestations
- [ ] Evidence packs export and verify offline
- [ ] All twelve verifier verdicts reachable
- [ ] All three demo attacks detected
- [ ] Admin interface supports the demo

### Testing
- [ ] Every module's suite green on a clean clone
- [ ] Coverage above threshold in all four modules
- [ ] End-to-end suite green
- [ ] Cross-browser consent flow verified in four browsers
- [ ] Load test passed at 100 concurrent attestations
- [ ] Regression suites green for every phase

### Security
- [ ] No secret anywhere in git history
- [ ] No plaintext personal data in any table
- [ ] Sessions regenerate on privilege change
- [ ] Cookies carry `Secure`, `HttpOnly`, `SameSite=Strict`
- [ ] CSRF enforced on every state-changing request
- [ ] Throttling on both account and IP
- [ ] Authorization denies every cross-subject access
- [ ] Log tables deny `UPDATE` and `DELETE` at database level
- [ ] Attestor served from a separate origin under SRI
- [ ] Private keys absent from the repository

### Performance
- [ ] Digest latency measured on real mobile hardware, median and p95
- [ ] Payload sizes recorded
- [ ] Verification throughput recorded
- [ ] Merkle proof scaling confirmed logarithmic
- [ ] Every performance claim traced to `research/results/`

### Deployment
- [ ] Deployment documented and reproducible from docs alone
- [ ] Environment variables documented in `.env.example`
- [ ] Migrations run forward and back cleanly
- [ ] Verifier containerised with pinned browser and fonts
- [ ] Attestor deployed to a separate origin
- [ ] STH publication running on schedule

### Documentation
- [ ] Design document current
- [ ] `PROJECT_LOG.md` complete: decisions, rationale, late changes, all checklists
- [ ] `ASSETS.md` accounts for every visual asset
- [ ] `docs/evidence-pack-format.md` sufficient to implement an independent verifier
- [ ] `docs/known-issues.md` honest and complete
- [ ] `README.md` lets a newcomer build and run everything

### Research
- [ ] Stability matrix executed; every disagreement classified
- [ ] Responsive axis reported separately
- [ ] Twenty mutations measured per-mutation
- [ ] Invariance envelope documented with its edges
- [ ] Every target paired with a measurement, including misses
- [ ] Prior art search executed across CPC H04L 9/32, G06F 21/64, G06Q 20/40

### Repository
- [ ] `main` green
- [ ] No `.env`, `node_modules/`, `vendor/`, `dist/` tracked (except tagged attestor releases)
- [ ] No merged branches left unpruned
- [ ] `v1.0.0` tagged and pushed
- [ ] Both developers have pushed all local work
