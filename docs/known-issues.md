# Known Issues & Empirical Limitations Register
**Project:** PS-3 Mutual Render Attestation (MRA)  
**Group:** TY-A9, Department of Computer Engineering, Vishwakarma Institute of Technology, Pune  
**Milestone:** 7.3 — Full Regression & Known Issues Audit  
**Status:** Maintained per standing research integrity rules (honest reporting of empirical limits)

---

## 1. Overview and Policy

In accordance with academic integrity and the project's verification protocol, all technical limitations, architectural constraints, and boundary conditions discovered during empirical evaluation are formally documented below. Each issue is assigned a unique identifier, severity level, description, trigger condition, and mitigation status.

```
+===================================================================================================+
|                                    SEVERITY CLASSIFICATION                                        |
+===================================================================================================+
| HIGH    : Breaks cryptographic guarantees, security invariants, or core verdict accuracy.         |
| MEDIUM  : Causes non-determinism under specific environment configurations or edge-case attacks.  |
| LOW     : Scope boundary, hardware dependency, or deliberate protocol trade-off.                  |
+===================================================================================================+
```

---

## 2. Issues Register

| ID | Title | Severity | Affected Module | Root Cause | Status |
|---|---|---|---|---|---|
| **KI-01** | Font Substitution Sensitivity | **MEDIUM** | M3 (Attestor) / M6 (Verifier) | Text metrics reflow altering bounding boxes | Documented (O-15) |
| **KI-02** | Below-the-Fold Occlusion Blind Spot | **MEDIUM** | M3 (Attestor) | Hit-testing restricted to initial viewport | Documented (O-17) |
| **KI-03** | Out-of-Region Context Digest Unreplayable | **LOW** | M6 (Verifier) | Application chrome omitted from sealed bundle | By Design (D-49 / O-08) |
| **KI-04** | Synthetic Evaluation Corpus | **LOW** | M8 (Research) | Parameterized generator vs live web crawl | Documented (O-18) |
| **KI-05** | Platform & Hardware Emulation Scope | **LOW** | M8 (Research) | Windows 11 testbed; CPU slowdown mobile proxy | Documented |
| **KI-06** | Local Tree Head Publication Witness | **LOW** | M5 (Transparency Log) | Local script publication without remote mirror | Open Item (O-02) |
| **KI-07** | WebAuthn Hardware Tier Unimplemented | **LOW** | M4 (Client) | Hardware token enrollment deferred to future work | Future Work |
| **KI-08** | Simulated SMTP Email Delivery | **LOW** | M1 (Accounts) | Development file outbox used in place of SMTP relay | Dev Configuration |

---

## 3. Detailed Issue Reports

### KI-01: Font Substitution Sensitivity
* **Severity:** MEDIUM
* **Discovered:** Phase 6 (Real Rendering Evaluation, Milestone 6.1)
* **Description:** Cross-engine and cross-device render digest agreement drops to **84.97%** when system fallback fonts are substituted for primary web fonts.
* **Mechanism:** When a client environment substitutes a local fallback font (e.g., Arial vs Roboto), subtle differences in glyph advance widths, font metrics, and line heights cause minor text reflow. This reflow pushes element coordinates across discrete size or prominence bucket boundaries, resulting in an altered semantic digest.
* **Mitigation / Guidance:** The sealed bundle bundles self-hosted web fonts as base64 or SRI-pinned assets. The verifier matches the client’s reported font stack during Stage 11 re-render. Re-render agreement across matched fonts remains **99.43%**.

### KI-02: Below-the-Fold Occlusion Blind Spot
* **Severity:** MEDIUM
* **Discovered:** Phase 6 (Adversarial Sensitivity Benchmark, Milestone 6.2)
* **Description:** Multi-point raycast occlusion hit-testing achieved **93.7%** detection on transparent clickjacking overlays (164 of 175 applicable pages detected; 11 undetected).
* **Mechanism:** The Attestor samples 5 coordinates per interactive element using `document.elementFromPoint()`. When an interactive element (e.g., a "Reject All" button) is positioned below the viewport fold and the page has not been scrolled, `elementFromPoint` returns coordinates outside the active viewport boundary or fails to register the overlay layer.
* **Mitigation / Guidance:** Scroll-into-view hit testing prior to attestation capture resolves the blind spot. In production bundles, the critical region schema requires the primary consent boundary to fit within the default viewport without scrolling.

### KI-03: Out-of-Region Context Digest Unreplayable
* **Severity:** LOW
* **Discovered:** Phase 5 (Verifier Pipeline Design, Decision D-49)
* **Description:** The full-page context digest ($D_{\text{context}}$) captures the surrounding application shell (navigation bars, ads, dynamic content) and cannot be faithfully replayed by the verifier from the sealed bundle alone.
* **Mechanism:** The sealed bundle is strictly scoped to the critical interaction container (HTML + scoped CSS). The independent verifier cannot reconstruct dynamic DOM elements outside the critical container without re-executing full unsealed application scripts.
* **Resolution (D-49):** The verifier compares the Critical-Region Digest ($D_{\text{region}}$) by default (`compareContext: false`). The context digest remains bound to the attestation as forensic secondary evidence for dispute resolution.

### KI-04: Synthetic Evaluation Corpus
* **Severity:** LOW
* **Discovered:** Phase 6 (Milestone 6.1, Decision D-48)
* **Description:** All sensitivity (20 mutations) and stability (24,000 renders) benchmarks were measured on a synthetic corpus of 200 parameterized consent pages (`research/corpus/pages.cjs`), not captured live web banners.
* **Scientific Boundary:** No claims may be made regarding the distribution or prevalence of dark patterns across the live web. The corpus serves strictly as a controlled benchmark demonstrating the detection envelope under synthetic laboratory conditions.

### KI-05: Platform & Mobile Emulation Bounds
* **Severity:** LOW
* **Discovered:** Phase 6 (Cost Benchmarking, Milestone 6.3)
* **Description:** All measurements were gathered on an AMD Ryzen 7 7840HS Windows 11 workstation. Mobile latency figures represent an emulated 4x CPU slowdown proxy.
* **Scientific Boundary:** Safari/WebKit was unavailable on the test hardware and is not evaluated. Physical mobile measurements remain designated for future field testing via `research/results/mobile-timing.html`.

### KI-06: Local Tree Head Publication Witness
* **Severity:** LOW
* **Discovered:** Phase 4 (Merkle Transparency Log, Open Item O-02)
* **Description:** The transparency log supports automatic Signed Tree Head (STH) generation and local publication (`bin/publish_sth.php`), but no third-party external witness mirror (e.g., public GitHub repository, CT log monitor) is active.
* **Status:** The publishing hook exists as an architectural mechanism. Operational multi-witness replication is documented as future production infrastructure.

### KI-07: WebAuthn Hardware Tier Deferred
* **Severity:** LOW
* **Discovered:** Phase 3 (Client Attestation, Decision D-22)
* **Description:** Client attestations are signed using WebCrypto non-extractable ECDSA P-256 keys generated in-memory. Hardware-bound WebAuthn authenticator binding was designed but deferred to conserve scope.
* **Status:** In-memory non-extractable keys provide strong origin-bound non-exportability within the browser context. FIDO2/WebAuthn hardware tokens are proposed for future banking/legal extensions.

### KI-08: Development File Outbox for Email Verification
* **Severity:** LOW
* **Discovered:** Phase 0 (Account Layer)
* **Description:** Email verification codes during user registration are written to `server/var/outbox/` in development rather than dispatched via a live authenticated SMTP server.
* **Status:** Fully functional for local automated testing and evaluation. The codebase includes authenticated SMTP transport configuration ready for production mailer credentials.
