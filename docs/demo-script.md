# Three-Minute Examination Demonstration Script
**Project:** PS-3 Mutual Render Attestation (MRA)  
**Group:** TY-A9, Department of Computer Engineering, Vishwakarma Institute of Technology, Pune  
**Faculty Guide:** Prof. Rahul Diwate  
**Demonstrators:** Aryan Ketkar, Chetan Agrawal  
**Target Duration:** 3 minutes (with 2-minute Q&A buffer)

---

## 1. Preparation & Pre-Flight (10 Seconds Before Start)

1. **Clean Starting State:** Run the one-command reset script:
   ```powershell
   powershell -File scripts\reset-demo.ps1
   ```
2. **Services Running:**
   - Database on port `3307`
   - PHP API server on `http://127.0.0.1:8080`
   - Attestor host on `http://127.0.0.1:8090`
   - Client on `http://127.0.0.1:5173`
   - Verifier service on `http://127.0.0.1:8095`
3. **Browser Tabs Prepared:**
   - Tab 1: `http://127.0.0.1:5173/` (Home Page)
   - Tab 2: `http://127.0.0.1:5173/verifier` (Independent Verifier)
   - Tab 3: DevTools Console open on Tab 1

---

## 2. The Three-Act Demonstration

```
+---------------------------------------------------------------------------------------------------+
| ACT 1: Honest Flow (45s)    | ACT 2: Post-Load Attack (60s)  | ACT 3: Spliced Signature (45s)     |
| User assents to agreement;  | Server alters disclosure text; | Adversary forges client attestation|
| Evidence Pack created.      | Verifier pinpoints exact node. | Cryptographic signature rejected.  |
| Verdict: VERIFIED           | Verdict: DIGEST_MISMATCH       | Verdict: CLIENT_SIGNATURE_INVALID  |
+---------------------------------------------------------------------------------------------------+
```

### Act 1: The Honest Path (0:00 – 0:45)
1. **Show the Problem:** Open Tab 1 (`/`). Point to the hero section:
   > *"When a user clicks 'I agree', the company's database flag is one-sided. Screenshots can be edited in DevTools; server logs can be fabricated. MRA produces bilateral cryptographic evidence neither side can forge."*
2. **Sign In & Consent:**
   - Click **"Go to Consent Flow"** (signs in as `demo@vit.edu`).
   - The consent form loads. Expand the **Technical Evidence Panel**.
   - Point to:
     * *Server Commitment (Ed25519)* signed over the sealed bundle before interaction.
     * *Attestor Module* loaded under SRI from `127.0.0.1:8090` with non-extractable ECDSA P-256 keys.
3. **Assent & Download Pack:**
   - Tick checkbox, click **"Record Bilateral Attestation"**.
   - Show the success panel: Merkle inclusion proof verified in browser, Signed Tree Head (STH) anchored.
   - Click **"Verify in Independent Dashboard"** (or download the ZIP).

### Act 2: Notice Alteration Attack (0:45 – 1:45)
1. **Explain the Threat:**
   > *"What if the server or a rogue script rewrote the text after the page loaded to trick the user into consenting to broader data sharing?"*
2. **Live Attack Demonstration (or 1-Click Pack):**
   - On the Verifier page (`/verifier`), click the quick-demo button: **`Load "Altered Notice" Pack`**.
   - Click **"Run 11-Stage Verification"**.
3. **The Result:**
   - Stages 1–10 pass (hashes and Merkle proofs are intact).
   - Stage 11 executes a clean headless Chromium re-render.
   - Verdict: **`DIGEST_MISMATCH`**.
   - Show the node diff table:
     * **Node 1 (paragraph):**
     * *Attested (what user saw):* `"we will never share your data with anyone."`
     * *Committed (what server claimed):* `"we share your usage data with selected partners for advertising and analytics..."`
   > *"The verifier pinpoints the exact mutated DOM element and displays the visual discrepancy."*

### Act 3: Spliced Signature / Forgery Attack (1:45 – 2:30)
1. **Explain the Threat:**
   > *"What if the server operator tries to forge a client assent by splicing an old client signature onto a new terms bundle?"*
2. **Demonstration:**
   - Click the quick-demo button: **`Load "Tampered Attestation" Pack`**.
   - Click **"Run 11-Stage Verification"**.
3. **The Result:**
   - Fails at Stage 6: **`CLIENT_SIGNATURE_INVALID`**.
   > *"The client's ECDSA P-256 signature is non-extractable and cryptographically bound to the server's single-use CSPRNG nonce and commitment hash. Any alteration invalidates the mathematical signature."*

### Act 4: Transparency & Immutable Audit (2:30 – 3:00)
1. **Show Merkle Log:**
   - Show `http://127.0.0.1:8080/api/log/head`:
   - Point to the Ed25519 Signed Tree Head (STH) and tree size.
2. **Show Database Privileges:**
   - Explain: The database user has `INSERT` and `SELECT` rights only on evidence tables. Even full SQL injection cannot execute `UPDATE` or `DELETE` to rewrite past commitments.

---

## 3. Fallback Plan (If Live Network / Ports Fail)

If a browser port or service hangs during the viva, do not panic. Run the deterministic all-in-one test suite:
```powershell
$env:MRA_PHP="C:\xampp\php\php.exe"; $env:MRA_PHP_FLAGS="-d extension=sodium"; $env:OPENSSL_CONF="C:\xampp\apache\conf\openssl.cnf"; node e2e\full-stack.cjs
```
This script launches its own headless daemons, drives Chromium through registration, OTP, consent, post-load DOM mutation, replay, and Merkle verification, printing 20 green `PASS` checks in 15 seconds.

---

## 4. Likely Examiner Questions & Crisp Answers

| Question | Answer |
|---|---|
| **Why not just take a PNG screenshot?** | Screenshots depend on device resolution, GPU antialiasing, and zoom; they cannot detect zero-width character injection and cannot produce a node-level AST diff naming what changed. Semantic layout digestion provides 99.43% cross-engine determinism. |
| **Why not use Ethereum / Blockchain?** | Blockchains solve timestamping, not visual fidelity. A company could anchor a compliant page on-chain while serving deceptive CSS to users. MRA binds the client's actual rendered accessibility tree to an RFC 6962 Merkle log at near-zero gas/energy cost. |
| **What if the server serves a malicious attestor?** | The Attestor build hash is permanently bound inside the server's signed commitment and registered with public verifiers. The browser checks SRI before execution; an altered attestor refuses to run. |
