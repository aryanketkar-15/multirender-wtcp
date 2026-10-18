# Deployment & Operations Guide
**Project:** PS-3 Mutual Render Attestation (MRA)  
**Group:** TY-A9, Department of Computer Engineering, Vishwakarma Institute of Technology, Pune  
**Milestone:** 7.4 — Demo and Release Documentation

---

## 1. System Requirements

* **Operating System:** Windows 10/11, Ubuntu 22.04 LTS, or macOS 13+
* **PHP:** Version 8.2+ with required extensions:
  - `ext-sodium` (Ed25519 signing & XChaCha20-Poly1305 AEAD)
  - `ext-pdo_mysql` (MariaDB database persistence)
  - `ext-openssl` (Asymmetric cryptography & random bytes)
  - `ext-mbstring` & `ext-zip` (Encoding & Evidence Pack ZIP archiving)
* **Database:** MariaDB 10.4+ or MySQL 8.0+ running with InnoDB storage engine.
* **Node.js:** v20.x or v22.x LTS with `npm` 10+.
* **Headless Browser Engine:** Playwright Chromium (`npx playwright install chromium`).

---

## 2. Directory Layout & Network Topology

```
             +-------------------------+
             |   Client Web Browser    |
             |  http://127.0.0.1:5173  |
             +------------+------------+
                          |
         +----------------+----------------+
         |                                 |
         v                                 v
+-----------------------+      +-----------------------+
|  Consent / API Server |      | Attestor Host (Static)|
| http://127.0.0.1:8080 |      | http://127.0.0.1:8090 |
+-----------+-----------+      +-----------------------+
            |
            +----------------+
            |                |
            v                v
+-----------------------+  +-----------------------+
|  MariaDB Database     |  | Independent Verifier  |
|   127.0.0.1:3307      |  | http://127.0.0.1:8095 |
+-----------------------+  +-----------------------+
```

---

## 3. Step-by-Step Deployment (Fresh Machine)

### Step 1: Clone & Configure Server
```bash
git clone https://github.com/aryanketkar-15/multirender-wtcp.git
cd multirender-wtcp/server
cp .env.example .env
```
Generate three distinct 64-character hexadecimal keys and set in `server/.env`:
* `APP_ENCRYPTION_KEY`: For XChaCha20-Poly1305 user data encryption.
* `BLIND_INDEX_PEPPER`: Secret HMAC pepper for searchable email hashes.
* `MRA_SERVER_SK`: 64-hex private key seed for Ed25519 commitment signing.
* `ATTESTOR_BASE_URL`: Set to `http://127.0.0.1:8090`.
* `DB_PORT`: Set to matching database port (e.g. `3307` or `3306`).

Install Composer dependencies and run migrations:
```bash
composer install --no-dev --optimize-autoloader
php bin/migrate.php up
```

### Step 2: Build & Register the Attestor Module
```bash
cd ../attestor
npm ci
npm run build
```
Register the versioned build with the server's recognized registry:
```bash
cd ..
php server/bin/register_attestor.php attestor/dist/manifest.json
```

### Step 3: Install & Build Client
```bash
cd client
npm ci
npm run build
```

### Step 4: Install Verifier Runtime
```bash
cd ../verifier
npm ci
npx playwright install chromium
```

---

## 4. Starting Production / Dev Services

Open four terminal windows (or process manager like `pm2` / systemd):

* **Service 1: PHP API Server**
  ```powershell
  cd server
  php -S 127.0.0.1:8080 -t public dev-router.php
  ```
* **Service 2: Attestor Static Host**
  ```powershell
  cd attestor
  node scripts/serve.cjs 8090
  ```
* **Service 3: Verifier HTTP Daemon**
  ```powershell
  cd verifier
  node -e "require('./src/server.ts')" # or through bundled runner
  ```
* **Service 4: Client Web Application**
  ```powershell
  cd client
  npx vite --port 5173 --host 127.0.0.1
  ```

---

## 5. Security & Isolation Hardening

1. **Database Grant Restrictions:** Apply `apply_grants.php` to limit the application database user to `INSERT` and `SELECT` only on evidence and log tables:
   ```bash
   php server/bin/apply_grants.php
   ```
2. **Subresource Integrity (SRI):** The attestor script is loaded under strict SRI hashes dynamically verified against the server's signed commitment.
3. **Session Cookies:** Configured with `SameSite=Strict`, `HttpOnly`, and `Secure` with a 30-minute idle and 12-hour absolute lifetime.
4. **Log Separation (D-16):** Operational audit logs (`server/var/logs/`) are rotated daily with PII redaction and kept isolated from the append-only Merkle evidence log.
