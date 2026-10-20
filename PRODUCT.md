# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

1. **Regulatory & Compliance Auditors / Courtroom Examiners:** Legal and technical evaluators who need to inspect an immutable evidence pack, re-render a historical consent bundle, and determine if deceptive dark patterns or DOM tampering occurred.
2. **Academic Evaluators (VIT Pune / Prof. Rahul Diwate):** Engineering examiners evaluating cryptographic integrity, bilateral non-repudiation, and front-end semantic accuracy.
3. **End-Users (Consumers):** Web users navigating legal notices and cookie consent dialogs who need clear, accessible, non-deceptive disclosures and verifiable proof of their assent.

## Product Purpose

Mutual Render Attestation (MRA) eliminates one-sided dispute vulnerability in online agreements. In traditional web consent, the service provider unilaterally stores a database flag ("user clicked agree"), which can be easily fabricated or manipulated. MRA produces bilateral, cryptographically non-repudiable evidence that mathematically binds the server's pre-interaction visual commitment (Ed25519) to the client's rendered on-screen accessibility digest (ECDSA P-256) inside an RFC 6962 append-only Merkle transparency log.

## Positioning

Unlike digital document signatures (which sign raw text/PDF bytes oblivious to DOM styling) or screenshots (which can be trivially faked in browser DevTools), MRA proves the exact visual-spatial state rendered on screen (prominence, contrast, size, occlusion, and text) with an independent headless browser verification pipeline.

## Operating Context

- Desktop and mobile web environments across modern browser engines (Chromium, Chrome, Edge, Firefox).
- High-stakes legal, privacy, and regulatory dispute workflows where technical proof must be verified by a third-party auditor without trusting the server operator.

## Capabilities and Constraints

- **Bilateral Cryptographic Protocol:** Ed25519 server commitment + WebCrypto non-extractable ECDSA P-256 client attestation.
- **Semantic Layout Digest (Attestor v1.1.0):** 8-role allowlist, strict Unicode NFKC text normalization, 5-point raycast occlusion checks, WCAG 2.1 contrast ratio calculations, and RFC 8785 canonical JSON serialization.
- **Offline Independent Verification:** 11-stage verification pipeline with headless Chromium re-rendering and fine-grained AST node discrepancy diffs (`VERIFIED` vs `DIGEST_MISMATCH`).
- **Zero Third-Party CDN/Tracker Dependencies:** Self-contained styling and assets.

## Brand Commitments

- Authoritative, cryptographic, institutional-grade engineering aesthetic.
- WCAG 2.1 AA accessibility compliance throughout (keyboard navigation, high-contrast ratios, screen reader semantics).
- Absolute transparency: Honest reporting of empirical boundaries and scientific limits.

## Evidence on Hand

- 24,000 real browser render matrix across Chromium, Chrome, Edge, Firefox.
- 20 adversarial dark pattern mutation suites (Nouwens 2020, Matte 2020).
- Real evidence pack archive fixtures (`honest_pack.zip`, `page_altered_pack.zip`, `tampered_attestation_pack.zip`).
- Full test suite passing across all tiers (Server PHPUnit, Client Jest, Attestor Jest, Verifier Jest).

## Product Principles

1. **Cryptographic Rigor Over Superficial Polish:** Every UI state and badge must reflect mathematically verifiable ground truth.
2. **Clarity for Both Experts and Non-Experts:** Diagnostic technical evidence panels for security researchers; intuitive visual diffs and plain-English summaries for examiners and users.
3. **Rock-Solid Visual Stability:** Zero layout shifts, high contrast readability, and deterministic layout presentation.
4. **Resilience & Graceful Recovery:** Skeletons for pending states, recoverable error boundaries, and no silent drops.
