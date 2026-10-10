# PS-3 Mutual Render Attestation — Project Log

**Maintained by:** Group TY-A9, Department of Computer Engineering, Vishwakarma Institute of Technology, Pune
**Course:** Web Technologies
**Faculty:** Prof. Rahul Diwate
**Document opened:** 2026-09-29
**Last updated:** 2026-10-03 (build playbook phases 0–2 implemented)

---

## 0. About this document

This log has been written in the present perfect tense and in the third person throughout, so that passages may be lifted into a research paper's methodology section or a patent specification's background and summary with minimal rewriting.

Three things have been recorded here that a code repository does not capture on its own:

1. **Why** each design decision has been taken, and what has been rejected in its place. Patent prosecution turns on the reasons a configuration has been chosen over alternatives; those reasons have been recorded at the moment of the decision rather than reconstructed afterwards.
2. **When** each decision has been reached. A dated record of conception has been maintained from the project's first day.
3. **What has changed late**, and why. Reviewers of a research paper have consistently asked what the authors have tried and abandoned; that history has been preserved rather than discarded.

The team has agreed that every entry is appended, never rewritten. Where a decision has been reversed, the original entry has been left intact and a superseding entry has been added below it.

---

## 1. Project identification

| Field | Value |
|---|---|
| Problem statement | PS-3 — Mutual Render Attestation |
| Central question | How can non-repudiable, independently verifiable evidence be produced that a specific semantic representation of a consent interface has been committed by the server before interaction and attested by the client at the time of interaction, without permitting either party to unilaterally fabricate a consistent alternative record? |
| Primary contribution | Two-sided render attestation over a semantic layout digest |
| Research object | The semantic layout digest and its measured invariance envelope |
| Stack | React, Web Worker, WebCrypto (client); PHP, MySQL (server); Node.js, Playwright (independent verifier) |

---

## 2. Methodology

The work has been organised as a design-and-measurement study rather than a pure implementation exercise. Four stages have been followed.

### 2.1 Gap analysis

Existing approaches to consent evidence have been surveyed and classified by who controls the evidence. Session replay products, screenshot-and-anchor services, content provenance standards and e-signature audit trails have each been examined. A single structural property has been found common to all of them: the evidence has been produced by one party. That observation has become the project's organising premise.

### 2.2 Adversarial design review

The initial design has been subjected to a deliberate attempt to defeat it before any implementation has begun. Three structural weaknesses have been identified and corrected (recorded as D-03, D-04 and D-05 below). The team has adopted the practice of attacking each component on paper before building it, on the reasoning that a flaw found during design has cost hours whereas the same flaw found during the demonstration would have cost the project.

### 2.3 Implementation in dependency order

Components have been sequenced so that each phase's correctness has been demonstrable before the next has begun. Determinism of the sealed bundle has been established before the digest has been designed, because a non-deterministic bundle would have made every downstream measurement meaningless.

### 2.4 Empirical validation

The central claim — that the digest is invariant to rendering environment while remaining sensitive to semantic manipulation — has been treated as a hypothesis to be measured, not a property to be asserted. A measurement harness has been scheduled for construction alongside the digest itself rather than afterwards.

---

## 3. Design decision log

Each entry records what has been decided, why, and what has been rejected.

### D-01 · 2026-09-29 · Problem statement selected

PS-3 has been chosen over the alternatives. The decision has rested on three factors: the gap in prior art has been found to be structural rather than incremental; the rubric features (session, cookies, encryption, validation) have mapped onto the mechanism naturally rather than requiring artificial insertion; and the demonstration has been judged to be unusually legible, since two attacks from opposite directions can be shown in under three minutes.

### D-02 · 2026-09-29 · Two-sided attestation adopted as the core mechanism

A protocol has been adopted in which the server commits to a sealed render bundle before interaction and the client independently attests to a normalised semantic representation at the moment of interaction. The reasoning has been that signatures, Merkle logs and headless rendering are all standard primitives, and that the novelty lies solely in the binding between them.

**Rejected:** single-sided capture with blockchain anchoring, on the grounds that anchoring establishes *when* a record has been created but never *by whom*, and that a vendor can anchor a compliant page while serving a different one.

### D-03 · 2026-09-29 · Attestor Module made independent of the consent server

The digest-computation code has been separated from the consent server, published as a versioned artifact, loaded with Subresource Integrity from a distinct host, and named by hash inside the signed server commitment.

**Reason:** in the initial design the digest code has been served by the same party whose honesty it was meant to test. A malicious server could have displayed deceptive content while shipping JavaScript that digested a fabricated clean document, and the client would have signed whatever that script produced. The client signature would therefore have attested to nothing. This has been judged the most serious flaw in the initial design.

**Residual limitation recorded:** a fully adversarial server may decline to load the module at all, producing no evidence. This has not been solved technically and has been reframed as a policy consequence — under a regime requiring verifiable attestation, the absence of an attestation constitutes a failed consent rather than a neutral state.

### D-04 · 2026-09-29 · Region Policy Schema and context digest introduced

A policy schema has been introduced that the verifier enforces, requiring a consent critical region to contain disclosure text, an accept control and a reject control. A second digest has been added over the entire visible viewport.

**Reason:** the critical region has originally been declared by the server, which could have declared a narrow region containing only compliant content and placed the deceptive element outside it. Everything attested would have been honest while the deception remained out of frame.

### D-05 · 2026-09-29 · Visibility, occlusion and prominence fields added to the semantic representation

Explicit fields have been added for computed visibility, occlusion measured by point sampling, and control prominence measured by area ratio.

**Reason:** an accessibility tree combined with text content has been found blind to the majority of documented dark patterns. An overlay covering a reject control, disclosure text rendered at very low opacity, and a reject button reduced to a fraction of the accept button's area all leave the accessibility tree and text content unchanged. Since the dark patterns catalogued in the Nouwens and Matte taxonomies are predominantly of this class, a digest blind to them would have failed its central purpose.

### D-06 · 2026-09-29 · Client attestation bound to the commitment hash rather than the bundle hash

**Reason:** binding to the bundle hash alone would have permitted a server to reuse one honest bundle under a different nonce, policy or expiry. Binding to the hash of the entire commitment object has closed that path.

### D-07 · 2026-09-29 · Two Merkle leaves adopted in place of one

A commitment leaf has been appended at issue time and an attestation leaf at finalisation time, the latter referencing the former.

**Reason:** a single combined leaf written at the end would have proved nothing about when the server committed. Ordering has been made provable through the log's own structure, which is the property the log exists to supply.

### D-08 · 2026-09-29 · Environment vector recorded but excluded from the digest

**Reason:** digesting viewport, device pixel ratio or forced-colors state would have rendered every device difference a mismatch. Recording the vector has instead permitted the verifier to replay under a matched profile.

### D-09 · 2026-09-29 · Pixel and screenshot hashing rejected

**Reason:** pixel hashes have been found to change with browser, GPU, rasteriser, device pixel ratio, zoom and font availability. They have also been found unable to detect zero-width character injection, which renders identically, and unable to identify *what* has changed when a mismatch occurs. A semantic digest has been adopted in their place, with the trade-off recorded explicitly: semantic rather than visual fidelity has been attested.

### D-10 · 2026-09-29 · Blockchain demoted to an optional deployment choice

**Reason:** a blockchain has been recognised as one implementation of an externally witnessed append-only medium, not as the innovation. Treating it as the core would have misrepresented the contribution. Publication of signed tree heads to a location outside the server's control, combined with the user's retained evidence pack as a witness, has been judged sufficient for the prototype.

### D-11 · 2026-09-29 · Ed25519 selected server-side, ECDSA P-256 client-side

**Reason:** Ed25519 has been chosen for the server for speed and misuse resistance, available through libsodium in PHP. P-256 has been chosen for the client because WebCrypto and WebAuthn support it natively, and a browser-side Ed25519 dependency would have added avoidable complexity.

### D-12 · 2026-09-29 · Established standards adopted for canonicalisation and log hashing

RFC 8785 JSON Canonicalization Scheme has been adopted for deterministic serialisation, and RFC 6962 leaf and node domain separation for the Merkle log.

**Reason:** citable precedent has been preferred over an invented scheme, both for reviewer confidence and because domain separation prevents second-preimage attacks in which an internal node is passed off as a leaf.

### D-13 · 2026-10-03 · Account layer with password and OTP email verification added

A registration, verification and login layer has been added following the course requirements.

**Reason recorded for the paper:** although introduced by a course requirement, the layer has been found to strengthen rather than dilute the contribution. An attestation bound only to an ephemeral browser key proves record consistency but not whose consent has been given. A verified-email account layer has upgraded the guarantee from "a client holding this key has attested this digest" to "this verified account holder has attested this digest." The consent disputes that reach regulators — insurance exclusions, loan terms, telecom renewals, subscription auto-renewal — have all been observed to occur inside authenticated relationships where an account already exists. The anonymous tier has been retained as the degraded fallback.

### D-14 · 2026-10-03 · Blind index adopted for the encrypted email column

An HMAC-SHA256 blind index has been stored alongside the ciphertext, with the pepper held in the environment rather than the database.

**Reason:** authenticated encryption has been found non-deterministic by design, so an encrypted email column cannot be searched and login lookup would have failed. The two commonly taken alternatives have been rejected — abandoning encryption, and switching to deterministic encryption, the latter because it leaks equality across the entire table.

### D-15 · 2026-10-03 · Digests, signatures and Merkle leaf hashes excluded from encryption at rest

**Reason:** these values must remain comparable and recomputable by an independent verifier who holds none of the system's keys. Encrypting them would have broken every inclusion proof and every digest comparison. Personal data has been encrypted; cryptographic material has been left in plaintext, since it is already one-way or public by design.

### D-16 · 2026-10-03 · Three separate logs established

The Merkle evidence log, the application audit log and the security log have been kept distinct, with different retention periods and different consumers.

**Reason:** conflating evidence with operational logging would have compromised both. The evidence log must be append-only and externally witnessed; the operational logs must be rotated and size-capped.

### D-17 · 2026-10-03 · Stated performance figures reclassified as hypotheses

The stability, sensitivity and latency targets have been reclassified from findings to hypotheses pending measurement.

**Reason:** the requirement that no claim be made without proof has been applied to the project's own numbers. Targets have been retained as targets, with measured results to be reported beside them including where measurement falls short.

---

## 4. Prior art considered

Recorded for the patent background section and the paper's related-work section.

| Prior art | What it does | Where it has been found to stop |
|---|---|---|
| rrweb, FullStory, LogRocket | Record document mutations server-side | Vendor-controlled, forgeable, not designed as evidence |
| ExpressConsent, GetProofAnchor | Screenshot plus timestamp plus hash plus anchoring | One-sided: capture, signing and storage have all sat with the capturing party |
| C2PA / Content Credentials | Provenance for media assets | Asset-level, not interaction-level |
| eIDAS QES and e-signature audit trails | Bind identity and intent to a document | Bound to a document, not to a rendered interface |
| US 7,694,332 and US 8,370,916 | Digital receipt for a transaction | Evidence has been generated and held by the service provider |
| DOMtegrity (Toreini et al., 2019) | Web page integrity against malicious browser extensions | Addresses extension interference, not server-versus-user dispute; identified as complementary |
| RFC 6962 Certificate Transparency | Append-only log with inclusion and consistency proofs | Adopted as a building block, not a competitor |

**Search classes to be examined:** CPC H04L 9/32, G06F 21/64, G06Q 20/40. One-sided capture art has been anticipated; the distinguishing features have been identified as pre-commitment prior to interaction combined with a client-side normalised digest computed by an independently hosted attestor.

---

## 5. Progress status

| Phase | Scope | Status |
|---|---|---|
| Design | Architecture, protocol, attack model, limitations | **Complete** — design document published 2026-09-29, extended 2026-10-03 |
| Phase 0 | Account layer, validation, OTP, encryption at rest, logging, test scaffold | **Implemented** (playbook phases 0 and 1; SMTP delivery against a real provider not yet exercised) |
| Phase 1 | Sealed bundle, commitment signing, session and nonce | **Implemented** (playbook phase 2; second-machine determinism check outstanding) |
| Phase 2 | Attestor Module, semantic digest, stability harness | **Implemented** (playbook phase 3; thresholds provisional, stability harness is an informal seed only) |
| Phase 3 | Client signing, Merkle log, inclusion proofs | **Implemented** (playbook phase 4; WebAuthn tier not built; external witness mechanism built and tested locally, no real remote or schedule) |
| Phase 4 | Verifier, evidence pack, product polish, demonstration | Not started |

---

## 6. Late changes

Changes arriving after a phase has been considered settled. Maintained separately because reviewers have consistently asked what has shifted and why.

| Date | Change | Trigger | Impact |
|---|---|---|---|
| 2026-09-29 | Attestor Module separated from the consent server | Adversarial design review | Architecture; a second host has become a deployment requirement |
| 2026-09-29 | Region Policy Schema and context digest introduced | Adversarial design review | Verifier gained two checks; attestation gained a second digest |
| 2026-09-29 | Occlusion and prominence fields added | Dark-pattern taxonomy review | Digest sensitivity extended; environmental stability risk increased |
| 2026-10-03 | Account layer with password and OTP added | Course requirement | Approximately one additional person-week; identity binding strengthened |
| 2026-10-03 | Encryption at rest with blind index added | Course requirement | Schema change; login path altered |
| 2026-10-03 | Build order revised to run Phase 0 in parallel with Phase 1 | Dependency analysis | Evidence-pack authorization depends on real accounts existing |

---

## 7. Open items

| ID | Item | Decision needed from | Blocks |
|---|---|---|---|
| O-01 | Whether syllabus units III and IV must be demonstrated; if so the verifier moves from Node.js to Spring Boot | Prof. Diwate | Phase 4 |
| O-02 | Where signed tree heads will be published externally | Team | Phase 3 |
| O-03 | The fixed list of 20 adversarial mutations, to be settled before digest thresholds are implemented | Team | Phase 2 |
| O-04 | The end-to-end workflow in the design document does not yet include registration, OTP verification and login | Team | Report drafting |
| O-05 | The architecture diagram does not yet show the account layer | Team | Report drafting |
| O-06 | The Web Technology mapping table's authentication row predates the account layer | Team | Report drafting |
| O-07 | No dedicated database-layer section exists; connection handling, migrations and transaction policy are currently covered only by a single table row | Team | Report drafting |
| O-08 | Context digest covers the application chrome; a bundle-only replay cannot reproduce it (section 12.3) | Team | Phase 5 |
| O-09 | Attestor build reproducibility on the second developer's machine | Team | Attestor release |

---

## 8. Checklists

### 8.1 Mandatory course requirements

- [x] Session management implemented and bound to attestation
- [x] Secure, HttpOnly, SameSite cookie configuration verified
- [x] Database connection via PDO with prepared statements throughout
- [x] Encryption of personal data at rest, with blind index for email
- [x] Required-field validation, client and server side
- [x] Range validation on validity window, retention period and OTP
- [ ] Email identity verified by OTP over authenticated SMTP
- [x] Compare-field validation on password and retype
- [ ] Product-grade presentation: empty, loading and error states
- [ ] Responsive layout verified at phone width
- [ ] Accessibility verified — keyboard navigation, labelling, contrast
- [x] Application audit log implemented
- [x] Security log implemented
- [x] Log rotation and size caps configured
- [x] Component tests passing
- [x] Database tests passing
- [x] No ready-made GIFs, logos or photographs; `ASSETS.md` complete (so far)
- [ ] Every quantitative claim traced to a committed measurement harness

### 8.2 Protocol implementation

- [x] Sealed bundle generation deterministic across repeated runs
- [x] Bundle canonicalisation per RFC 8785
- [x] Server commitment signed with Ed25519 before interaction is possible
- [x] Nonce generated by CSPRNG, single-use, session-bound
- [ ] Attestor Module published, versioned and SRI-pinned on a separate host
- [ ] Attestor hash named in the commitment and checked by the verifier
- [x] Semantic representation covers roles, text, state, visibility, occlusion and six bucketed styles
- [x] Normalisation applies NFKC, case folding, whitespace collapse and zero-width stripping
- [x] Critical region digest and context digest both computed
- [ ] Client key non-extractable; WebAuthn tier available where an account exists
- [x] Attestation binds to the commitment hash, not the bundle hash
- [x] Merkle commitment leaf appended at issue time
- [x] Merkle attestation leaf appended at finalisation, referencing the commitment leaf
- [x] Inclusion proofs generated and verified
- [ ] Signed tree heads published externally on a schedule
- [ ] Evidence pack exports as a self-contained archive
- [ ] Only the session subject may download their own pack

### 8.3 Verifier

- [ ] Runs as a separate service with no shared keys or database access
- [ ] All twelve verdict paths reachable and covered by fixture tests
- [ ] Playwright runs headed under Xvfb
- [ ] Environment profile matched from the attestation
- [ ] Font stack pinned in the verifier container
- [ ] Diff output names the diverging node, its role and the field-level difference

### 8.4 Research deliverables

- [ ] Corpus of 200 consent interfaces assembled
- [ ] Stability matrix executed across browsers, viewports, device pixel ratios and font-fallback conditions
- [ ] Responsive re-layout measured as a distinct axis from environment variation
- [ ] Adversarial mutation suite of 20 mutations fixed before threshold implementation
- [ ] Sensitivity results reported per mutation
- [ ] Cost measurements: client digest time, payload size, verification throughput
- [ ] Invariance envelope documented with its edges, including where it degrades
- [ ] Failures reported alongside successes

### 8.5 Paper and patent readiness

- [ ] Decision log complete with dates and rationale for every design choice
- [ ] Prior art search executed across CPC H04L 9/32, G06F 21/64, G06Q 20/40
- [ ] Distinguishing features stated against each closest reference
- [ ] Claim language drafted and reviewed
- [ ] Methodology section drafted from section 2 of this log
- [ ] Related work drafted from section 4 of this log
- [ ] Limitations section states precisely what is not proven
- [ ] No claim in the paper lacks a measurement or a citation

---

## 9. Maintenance

The team has agreed on the following conventions.

- A decision entry has been added at the time the decision has been taken, not retrospectively.
- Every decision entry records what has been rejected, since the rejected alternative is what establishes the reason for the chosen configuration.
- Entries have been appended rather than edited. A reversal has been recorded as a new superseding entry.
- The late-changes table has been updated whenever a settled phase has been reopened.
- Checklist items have been ticked only once verified, not once attempted.

---

## 10. Encryption at rest — column classification (milestone 1.1, 2026-10-03)

Recorded at the time the `users` table has been created. Encrypted columns use XChaCha20-Poly1305
(libsodium) with the column name bound as associated data, so a ciphertext copied into another
column fails authentication. The key (`APP_ENCRYPTION_KEY`) and the blind-index pepper
(`BLIND_INDEX_PEPPER`) are distinct values held in the environment outside the web root; the
prototype has no KMS and the report states this as a limitation.

| Column | Treatment | Reason |
|---|---|---|
| `users.email_enc` | **Encrypted** | Personal data |
| `users.name_enc` | **Encrypted** | Personal data |
| `users.email_bidx` | HMAC-SHA256 blind index, peppered | Makes the encrypted email searchable without deterministic encryption (D-14) |
| `users.password_hash` | Not encrypted | Already one-way (Argon2id); D-15 |
| `audit_log.ip_enc`, `audit_log.ua_enc`, `security_log.ip_enc` | **Encrypted**; stored null when no cipher is configured, never plaintext | IP address and user agent are personal data |
| `audit_log.detail`, `security_log.detail` | Not encrypted; passed through the structural redactor first | Operational detail; secret-bearing keys are replaced before write |
| Digests, signatures, public keys, Merkle leaf hashes (later phases) | **Never encrypted** | A verifier holding none of our keys must be able to recompute and compare them; D-15 |

---

## 11. Build record — playbook phases 0–2 (2026-10-03)

Appended, not rewritten. The build playbook numbers its phases 0–7; this log's section 5 uses a
coarser numbering. "Phases 0 to 2" below means the playbook's: setup, account layer, sealed bundle.

### D-18 · 2026-10-03 · Server-side sessions keyed by a hash of the cookie token

PHP's native sessions were rejected: they cannot be driven through an injectable clock, cannot be
revoked for one user across all clients, and are awkward to test without a web server. A `sessions`
table holds the SHA-256 of a 32-byte random token, so a database read yields no usable identifier.
Regeneration deletes the old row (the equivalent of `session_regenerate_id(true)`).

### D-19 · 2026-10-03 · CSRF scope

A per-session token is required on every state-changing request that carries a session (login,
logout, client-key registration, admin edits, attestation). Registration, OTP and password-reset
endpoints carry no ambient credential, so a forged cross-site request has nothing to ride on and
they are exempt. `SameSite=Strict` is the first defence; the token is the second.

### D-20 · 2026-10-03 · Account-enumeration controls

OTP request, password-forgot, login and OTP verification return identical status and body whatever
the address, and perform equivalent work (a decoy hash on the "no such account" path). Mail is
queued and sent after the response is flushed, so delivery latency cannot reveal registration.

### D-21 · 2026-10-03 · Sealed markup is restricted

The bundle builder refuses scripts, inline event handlers, `javascript:` URLs and any remote
reference (including CSS `@import` and remote `url()`), so a sealed bundle cannot fetch anything
at render time. The client also strips such constructs before insertion (defence in depth).

### Deviations from the playbook, recorded for the report

| Item | Playbook | Built | Reason |
|---|---|---|---|
| Migration numbers | 004–010 fixed | Numbered in build order, 001–016 | Phases 1 and 2 add tables in an interleaved order; numbers are only an ordering |
| `/.well-known/mra-key` | static file in `server/public/` | Route served from the loaded key store | The public key derives from the environment secret; a committed file would drift |
| Attestor hash in commitments | hash of the published Attestor Module | Placeholder (`attestor-pending`) until the module exists | The Attestor Module is a later phase; the field is present and covered by the signature |
| `log_leaf_index` in commitments | assigned at issue | `null` | The Merkle log is a later phase |
| Evidence-pack routes | stubs | Stubs behind ownership authorization | As specified |
| Client signature on attestation | later phase | Not built; the consent page records the action locally | As specified |

### Open verification items after phases 0–2

- T2.1.1 on the **second** developer's machine: run `php bin/bundle_hash.php` and compare with the
  pinned hash in `BundleBuilderTest`. One machine has been checked.
- Real SMTP delivery (milestone 1.3 checklist) has not been exercised: no SMTP credentials were
  available. Development uses a file outbox.
- CI has not run (no remote). Branch protection, PR review and push steps are not performed.
- Responsive layout at phone width and a keyboard/contrast accessibility pass have not been done.


---

## 12. Build record — playbook phase 3: Attestor Module and semantic digest (2026-10-03)

### 12.1 Normalisation order (milestone 3.2)

Fixed, documented in `attestor/src/normalise.ts`, and a version bump if ever changed:

1. **NFKC** — compatibility characters decompose first (fullwidth, mathematical letters, ligatures, no-break space).
2. **Strip invisibles** — soft hyphen, CGJ, Arabic letter mark, Mongolian vowel separator, zero-width space/non-joiner/joiner, LRM/RLM, bidi embeddings, overrides and isolates, word joiner and invisible operators, BOM.
3. **Case fold** — upper then lower, approximating full case folding without locale rules (sharp s becomes `ss`, sigma forms agree).
4. **Whitespace** — runs collapse to one space, then trim.

Reasons: stripping before NFKC would miss invisibles that only exist after decomposition; folding before NFKC would miss case in compatibility characters (a fullwidth capital); collapsing last catches spaces produced by steps 1–3.

### 12.2 Threshold justifications (milestone 3.3) — all provisional until O-03

Every bucket interval is half-open at its lower bound: a value exactly on a threshold belongs to the bucket above it. Each threshold is tested on both sides in `attestor/tests/buckets.test.ts` and in a real engine in `styles.test.ts`.

| Feature | Thresholds | Justification | Dark pattern |
|---|---|---|---|
| `size` (ratio to region base font) | 0.6 / 0.85 / 1.2 / 1.6 | 0.6 of a 16px base is 9.6px, below the size at which running text is routinely considered illegible. 0.85 is about 13.6px, the usual "fine print" band against body copy. 1.2 and 1.6 are where lead text and display text begin. Intervals are wide relative to engine variation (14.4px against 14.66px differs by 1.8% and shares a bucket). | Disclosure shrunk to near-illegibility |
| `weight` | 400 / 600 | 400 is CSS `normal`. 600 is the point at which font matching treats a face as bold. Fallback fonts that map 500 to 400 stay in `normal`. | Selective de-emphasis |
| `contrast` | 3.0 / 4.5 | Taken from WCAG 2.1: 3:1 is the AA minimum for large text, 4.5:1 for normal text. Standard-derived, not tuned. The `#767676`/`#777777` pair either side of 4.5 is tested. | Grey-on-grey reject text |
| `prominence` | 0.6 / 1.6 | Roughly symmetric about 1 (1/1.6 is 0.625). Equal-importance buttons with different label lengths differ in area by about 30%, so 0.6 leaves margin before a control is read as secondary. | Reject shrunk relative to Accept |
| `visible` opacity | 0.1 | Below 10% effective opacity black text on white has a contrast of about 1.26:1, which is not perceivable. | Hidden reject option |
| `occlusion` fraction | 0.2 / 0.8 over five points | With five points the achievable fractions are 0, 0.2 … 1. Any single covered point is `partial`; four of five is `blocked`. Chosen with that granularity in mind. | Overlay covering a control |

`visible` also treats zero-size, off-canvas (above or left of the page origin), and overflow-clipped elements as not visible. "In viewport" is read as "not off-canvas" rather than "inside the window", otherwise the window size would leak into the digest.

### 12.3 Findings recorded for the paper

1. **First cross-browser comparison (playbook go/no-go).** 10 fixtures × 3 viewport/DPR settings = 30 cells, across bundled Chromium 153, Chrome 154, Edge 154 and Firefox 152 (driven over WebDriver BiDi). First run: 27 of 30 cells agreed. All three disagreements were one node: the contrast of a **disabled button**, which Chromium-family browsers grey by default and Firefox does not. That is browser default styling, not author intent, and the `disabled` flag is already in the digest, so contrast is no longer measured on disabled controls. After the change: **30 of 30 agree** on both digests. This is a small informal sample on one operating system with system fonts; it is not the stability study (Phase 6), and it says nothing about Safari/WebKit, other operating systems, or font-fallback conditions. Script: `research/harness/cross-browser-informal.cjs`.
2. **Zero-width injection is invisible to the semantic digest by design.** Normalisation strips the characters, so the digest is unchanged; the raw markup differs, so the *bundle hash* changes. For the mutation suite this means the zero-width mutation is caught by the bundle-hash check against the commitment, not by the digest. The paper must not claim the digest detects it.
3. **Three or more buttons.** Prominence divides by the median of the *other* buttons, so one very large button makes two equal smaller ones read as `suppressed` (a 3× sibling gives 0.5). That matches the stated meaning, but it is a calibration question for the corpus.
4. **Occlusion blind spot.** `elementFromPoint` ignores `pointer-events: none` overlays, so a purely visual overlay that cannot be clicked does not register as occlusion. A control with `pointer-events: none` itself does (an ancestor is hit).
5. **`aria-hidden` and the digest.** Visible content marked `aria-hidden="true"` is skipped by extraction, per the playbook. A page could hide visible text from the digest this way. The bundle hash and the context digest are the defences; the verifier replays the same bundle, so it skips the same nodes.
6. **Context digest includes the application's own chrome.** The end-to-end run showed the context digest covers the whole page, including the header with the signed-in user's name. A verifier that replays only the sealed bundle will not reproduce that value. This must be resolved before Phase 5 (O-08).
7. **Timing datum for Phase 6.** `attest()` on a 501-node region took 35 ms in headless Chromium on a desktop machine. The 50 ms target is for mid-range mobile, which is unmeasured.

### 12.4 Decisions and deviations

- **D-22** Headings carry a style block (the design example omits it): a shrunken heading is a manipulation of the same kind as a shrunken paragraph.
- **D-23** Contrast is omitted for disabled controls (see finding 1).
- **D-24** Only buttons receive `prominence`; links do not, so an inline "terms" link is not flagged as suppressed.
- **D-25** The Web Worker is started from a Blob URL built from a string embedded in the module, so the release remains a single file under one integrity hash.
- **D-26** `attestor_hash` in commitments is now read from the `attestor_registry` (most recently published active build). With nothing registered the commitment carries a clearly marked placeholder and the browser is told there is no attestor, so no consent screen is shown.
- **D-27** The module's runtime dependency count is zero (`npm ls --omit=dev` is empty). `esbuild` is pinned to an exact version and is a build-time tool only.
- **Hosting compromise (3.5).** The attestor is served from a separate **origin** (another port on the development machine). That gives the browser's same-origin and SRI protections, not independent administration. It is not an independently operated host and the report must say so.

### 12.5 Open items after phase 3

| ID | Item | Blocks |
|---|---|---|
| O-03 | Fix the 20-mutation suite **before** finalising any threshold. Thresholds above are provisional. | Phase 6 sensitivity result |
| O-08 | Decide what the context digest covers so a verifier replaying only the bundle can reproduce it (consent surface only, or replay inside the application shell). | Phase 5 |
| O-09 | Second-machine reproducibility check: run `attestor/scripts/release.sh` on the other developer's machine and compare the `attestor_hash`. | Release `attestor-v1.0.0` |
| O-10 | Safari/WebKit and non-Windows engines are unmeasured. | Phase 6 stability study |
| O-11 | The verifier does not yet reject unrecognised attestor hashes (the registry exists; the verifier is Phase 5). | Phase 5 |


---

## 13. Build record — playbook phase 4: client attestation and Merkle log (2026-10-03)

### 13.1 Decisions

- **D-28 Strict attestation contract.** The attestation schema rejects unknown members at every level, so the set of signed fields is unambiguous and nothing can ride along unauthenticated. The signature is ECDSA P-256 over the RFC 8785 canonical text, carried as the 64-byte IEEE P1363 form that WebCrypto produces; the server converts it to DER for OpenSSL.
- **D-29 The commitment signs its own log index.** The log append runs a caller-supplied closure inside the append lock and the transaction. The closure receives the index the leaf will occupy, builds and signs the commitment with `log_leaf_index` inside it, and the commitment row and the leaf commit together. The commitment therefore names its own slot, and a forged index breaks its signature.
- **D-30 Validation order and codes.** Cheapest first: schema (422 `SCHEMA_INVALID`), signature (401 `CLIENT_SIGNATURE_INVALID`), then database checks: commitment known (`COMMITMENT_UNKNOWN`), session (403 `SESSION_MISMATCH`), key binding (401 `KEY_BINDING_INVALID`), nonce and attestor match (`NONCE_MISMATCH`, `ATTESTOR_MISMATCH`), replay (409 `REPLAY_DETECTED`), expiry (422 `COMMITMENT_EXPIRED`), attestor registry (`ATTESTOR_UNRECOGNISED`), action/target agreement (`ACTION_TARGET_INVALID`), region policy (`REGION_POLICY_VIOLATION`). The nonce is consumed last, by one atomic UPDATE inside the same transaction as the write, so a rejected attempt never spends it. Every rejection writes a security-log entry; replay uses its own event type.
- **D-31 Region policy `consent/v1`** is checked against the bundle the *server committed to*: disclosure text, an accept control (`#btn-agree`) and a reject control (`#btn-reject`), none hidden by attribute, inline style or the bundle stylesheet. The browser attests only digests, so the server cannot inspect the client's rendering; the check stops a server committing to a bundle that omits its own reject control.
- **D-32 A proof's tree size comes from the signed head.** A bare inclusion proof cannot tell some neighbouring tree sizes apart (found by a test whose premise was wrong). `MerkleProof::verifyAgainstHead` therefore requires the proof's size to equal the signed head's and checks the root.
- **D-33 The grant policy is code.** `GrantPolicy` gives the application account SELECT and INSERT only on the evidence tables (bundle, commitment, attestation, leaf, node, signed heads, publications), INSERT only on the two operational logs, and ordinary DML elsewhere. It is applied by `bin/apply_grants.php` and exercised against a real restricted account.
- **D-34 Key scope.** The browser key is scoped to a hash of the session's CSRF token, which changes whenever the session is regenerated; each session gets its own key, the previous one is deleted when the next is stored, and logout deletes all of them.
- **D-35 The log is publicly readable** (`/api/log/head`, `/api/log/proof/{index}`, `/api/log/consistency`). It holds digests and signed records only, and the contents were checked to contain no personal data.

### 13.2 Measurements (inputs to Phase 6)

| Measurement | Result | Context |
|---|---|---|
| Inclusion proof, 100,000 leaves | median 6.7 ms, worst 12.8 ms, 17 hashes | MariaDB on the development machine, PHP 8.2; target was under 100 ms |
| Inclusion proof, 10,000 leaves | 14 hashes for most leaves (8 for the last) | target was about 14 |
| Bulk load, 100,000 leaves | 9.4 s | test helper, not the production append path |
| Race: 3 simultaneous submissions of one attestation | exactly one 201 and two 409, in 4 of 4 rounds | real OS processes, committed rows |
| Race: 3 simultaneous consumptions of one nonce | exactly one winner, in 5 of 5 rounds | |

### 13.3 What was verified, and how

- The database-backed log was checked against a separate naive in-memory RFC 6962 implementation: roots for every size up to 40, inclusion paths for every leaf at every size up to 21, and consistency proofs for every pair up to 24, all identical.
- The grant tests create a real restricted account and attempt `UPDATE`, `DELETE`, `TRUNCATE`, `DROP` and `ALTER` on every evidence table; the database refuses each with error 1142 while `INSERT` and `SELECT` succeed on the same tables. The same refusals were reproduced against the real development schema as `mra_app`.
- End to end in a real browser (`e2e/full-stack.cjs`, 20 checks, run **as the restricted account**): a WebCrypto signature is accepted by PHP/OpenSSL; a post-load DOM change alters the posted digest; replay and post-signing alteration are refused; the signing key is gone from IndexedDB after logout; and Node's own crypto verifies the Ed25519 head signature and the log's inclusion proofs, so three implementations (PHP, TypeScript client, Node) agree.
- Signed tree heads were published to a real git repository (a bare local remote standing in for the witness) and the two published heads were shown to be provably one append-only history.

### 13.4 Deviations and limits, stated plainly

| Item | Playbook | Built | Note |
|---|---|---|---|
| WebAuthn tier | feature-flagged stretch | **not built** | The WebCrypto tier only. The report must present one tier, not two. |
| External tree-head witness | a second GitHub repository written on a schedule | a `GitWitness` publisher and `bin/publish_sth.php`, tested against a local bare git remote | **No real remote exists and nothing is scheduled.** Until a real `mra-sth-witness` repository receives heads on a schedule, the "externally witnessed" claim is not met in deployment. |
| Migration numbers | 013–016 | 018–021 | Numbered in build order. |
| Ordering of 4.2 and 4.3 | 4.2 then 4.3 | 4.3 committed first | The server contract existed before the client was written against it. |
| Attestation leaf index | assigned at validation | assigned in the same transaction as the nonce spend and the attestation row | A failed attestation adds nothing to the log (tested). |
| Deprecated attestor builds | not specified | rejected for **new** attestations, accepted only for historical verification | |

Findings worth keeping: OpenSSL on Windows XAMPP needs an `openssl.cnf` to generate keys (verification does not); `escapeshellarg` mangles `%` on Windows, so process arguments are passed as arrays; the first run of the restricted-account end-to-end check surfaced no application code that needed more than the granted privileges.

### 13.5 Open items after phase 4

| ID | Item | Blocks |
|---|---|---|
| O-02 | Create the real `mra-sth-witness` repository, give the publisher push access through the clone's own credentials, and schedule `bin/publish_sth.php`. | The externally witnessed claim |
| O-08 | Context digest still covers the application chrome; unresolved (section 12.3, finding 6). | Phase 5 |
| O-12 | The verifier does not yet re-render the committed bundle or compare digests; the server cannot see the client's region, only its digest. Region policy is enforced on the committed bundle only. | Phase 5 |
| O-13 | The logged attestation proves what the *client reported*. Whether that matches a faithful re-render of the committed bundle is the verifier's job. | Phase 5 |
| O-14 | Key management for the witness push credentials and the server signing key remains environment-variable only (prototype limitation). | Report |
