# Demonstration runbook

Everything below was run during development. The automatic check at the end is the safest fallback.

## 0. Setup and starting the servers (Windows PowerShell)

Windows PowerShell 5.1 has no `&&`: run one command per line. XAMPP's PHP is not on the PATH and needs
the sodium extension, so define this in every PowerShell window you use:

```powershell
function php { & C:\xampp\php\php.exe -d extension=sodium -d extension=zip @args }
```

**Already set up on the development machine** (the folder has `vendor`, `node_modules`, the built attestor, the
migrated database and `server\.env`): skip straight to the servers below. On a new machine you need Node 22,
PHP 8.2 (`sodium`, `openssl`, `pdo_mysql`, `mbstring`), Composer, MariaDB/MySQL and Chromium; create databases
`mra` and `mra_test`, fill `server\.env` from `.env.example` (three different 64-hex keys for
`APP_ENCRYPTION_KEY`, `BLIND_INDEX_PEPPER`, `MRA_SERVER_SK`; `ATTESTOR_BASE_URL=http://127.0.0.1:8090`), then:

```powershell
Set-Location server; composer install; php bin\migrate.php up; Set-Location ..
Set-Location client; npm ci; Set-Location ..
Set-Location attestor; npm ci; npm run build; Set-Location ..
php server\bin\register_attestor.php attestor\dist\manifest.json
```

The database must be running (the development instance listens on port 3307; see `server\.env`).

## 1. Start the three servers (three PowerShell windows)

```powershell
Set-Location server; php -S 127.0.0.1:8080 -t public dev-router.php
```

```powershell
Set-Location attestor; node scripts\serve.cjs 8090
```

```powershell
Set-Location client; npx vite --port 5173 --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. Verification emails appear as text files in `server\var\outbox` (no real SMTP in development).

## 2. Live demo script (about 6 minutes)

| Step | Do | Say |
|---|---|---|
| 1 | **Register** with a 12+ character password. Show the validation messages by leaving fields wrong. | Same rules run in the browser and again on the server; the server is the boundary. |
| 2 | Open the newest file in `server/var/outbox`, type the **6-digit code** on the verify page. | OTP is hashed in the database, expires in 10 minutes, five attempts. |
| 3 | **Sign in**, open **Consent**. Point at the unticked checkbox and the disabled Accept button. | We forbid in our own form the pre-ticked box our digest detects in others. |
| 4 | Open **Technical evidence**. | Two digests were just computed by a module loaded from a *different origin* under Subresource Integrity, not by our server. |
| 5 | **Attack 1, edit after load.** In the browser console: `document.querySelector('#disclosure').textContent='We never share your data.'` then tick the box and click **Accept**. | The digest is taken at the moment of the click, so it now differs from the one shown at load. |
| 6 | **Attack 2, replay.** Run the automatic check (section 3), or in the console resend the same request. | Refused with `REPLAY_DETECTED`: a nonce is single use. |
| 7 | Show `http://127.0.0.1:8080/api/log/head` after running `php server/bin/sign_sth.php`. | Both records are in an append-only Merkle log; the head is signed. |
| 8 | Show the append-only claim: `php server/bin/apply_grants.php` has been applied for the restricted account; an `UPDATE` on `mra_leaf` is refused by the database. | Even SQL injection could not rewrite history. |

What you **cannot** show yet: the independent verifier turning a mismatch into a named verdict. Say so, and show the two halves of the evidence instead.

## 3. The fallback that always works: one command

With the database up and the attestor registered:

```powershell
$env:MRA_PHP="C:\xampp\php\php.exe"; $env:MRA_PHP_FLAGS="-d extension=sodium"; $env:OPENSSL_CONF="C:\xampp\apache\conf\openssl.cnf"; node e2e\full-stack.cjs
```

It starts the three servers itself, drives a real browser through register, OTP, login, consent, post-load tampering, replay and forgery, and prints 20 PASS lines, including a JavaScript verification of the log's Merkle proofs and the Ed25519 head signature. Do not run it while the three servers above are already running (it starts its own).

## 4. Showing the tests

```bash
cd server && vendor/bin/phpunit      # 415 tests
cd client && npm test                # 146 tests
cd attestor && npm test              # 234 tests, real browser
```

Cross-browser comparison (needs Chrome, Edge and Firefox installed): `node research/harness/cross-browser-informal.cjs`.

## 5. Likely questions

| Question | Answer |
|---|---|
| Why not just hash a screenshot? | It changes with browser, GPU, zoom and fonts, cannot detect zero-width text injection, and cannot say what changed. Rejected in decision D-09. |
| Why not a blockchain? | It proves when, not who. A vendor can anchor a compliant page and serve another. A signed log plus published heads gives the property we need (D-10). |
| What stops the server serving a malicious attestor? | The attestor's hash is named inside the server's signed commitment and registered; the browser loads it under SRI and re-hashes it. A server that refuses to load it yields no evidence, which we treat as a failed consent. |
| What is actually proven? | That this verified account holder's browser attested this digest of the committed bundle. Not which human, and only semantic fidelity. |
| Is it ready to deploy? | No: prototype key management is environment variables, the attestor host is not independent, and the verifier is not built. |
