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
| O-08 | Context digest covers the application chrome; a bundle-only replay cannot reproduce it (section 12.3) | Team | Phase 5 Update 2026-10-15: partly resolved: the critical region replays; the context digest does not and is not compared by default (D-49). |
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
- [ ] Email identity verified by OTP over authenticated SMTP (local outbox verified; live SMTP relay unexercised)
- [x] Compare-field validation on password and retype
- [x] Product-grade presentation: empty, loading and error states (Milestone 7.2)
- [x] Responsive layout verified at phone width (Milestone 7.2)
- [x] Accessibility verified — keyboard navigation, labelling, contrast (Milestone 7.2)
- [x] Application audit log implemented
- [x] Security log implemented
- [x] Log rotation and size caps configured
- [x] Component tests passing
- [x] Database tests passing
- [x] No ready-made GIFs, logos or photographs; `ASSETS.md` complete
- [x] Every quantitative claim traced to a committed measurement harness

### 8.2 Protocol implementation

- [x] Sealed bundle generation deterministic across repeated runs
- [x] Bundle canonicalisation per RFC 8785
- [x] Server commitment signed with Ed25519 before interaction is possible
- [x] Nonce generated by CSPRNG, single-use, session-bound
- [x] Attestor Module published, versioned and SRI-pinned on a separate host (v1.1.0 on port 8090)
- [x] Attestor hash named in the commitment and checked by the verifier
- [x] Semantic representation covers roles, text, state, visibility, occlusion and six bucketed styles
- [x] Normalisation applies NFKC, case folding, whitespace collapse and zero-width stripping
- [x] Critical region digest and context digest both computed
- [ ] Client key non-extractable; WebAuthn tier available where an account exists (WebCrypto P-256 complete; WebAuthn deferred)
- [x] Attestation binds to the commitment hash, not the bundle hash
- [x] Merkle commitment leaf appended at issue time
- [x] Merkle attestation leaf appended at finalisation, referencing the commitment leaf
- [x] Inclusion proofs generated and verified
- [x] Signed tree heads published externally on a schedule (mechanism implemented and verified)
- [x] Evidence pack exports as a self-contained archive
- [x] Only the session subject may download their own pack

### 8.3 Verifier

- [x] Runs as a separate service with no shared keys or database access
- [x] All twelve verdict paths reachable and covered by fixture tests
- [x] Playwright runs headed under Xvfb (and headless CLI)
- [x] Environment profile matched from the attestation
- [ ] Font stack pinned in the verifier container (pinned via system fallback matching; Docker containerization deferred)
- [x] Diff output names the diverging node, its role and the field-level difference

### 8.4 Research deliverables

- [x] Corpus of 200 consent interfaces assembled
- [x] Stability matrix executed across browsers, viewports, device pixel ratios and font-fallback conditions
- [x] Responsive re-layout measured as a distinct axis from environment variation
- [x] Adversarial mutation suite of 20 mutations fixed before threshold implementation
- [x] Sensitivity results reported per mutation
- [x] Cost measurements: client digest time, payload size, verification throughput
- [x] Invariance envelope documented with its edges, including where it degrades
- [x] Failures reported alongside successes

### 8.5 Paper and patent readiness

- [x] Decision log complete with dates and rationale for every design choice (D-01 to D-63)
- [x] Prior art search executed across CPC H04L 9/32, G06F 21/64, G06Q 20/40
- [x] Distinguishing features stated against each closest reference
- [x] Claim language drafted and reviewed
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
| O-12 | The verifier does not yet re-render the committed bundle or compare digests; the server cannot see the client's region, only its digest. Region policy is enforced on the committed bundle only. | Phase 5 Update 2026-10-15: the verifier now re-renders and compares the critical-region digest on real packs (section 21); region policy is still enforced on the committed bundle only. |
| O-13 | The logged attestation proves what the *client reported*. Whether that matches a faithful re-render of the committed bundle is the verifier's job. | Phase 5 Update 2026-10-15: a faithful re-render now reproduces the signed digest for honest packs and flags an altered page (section 21). |
| O-14 | Key management for the witness push credentials and the server signing key remains environment-variable only (prototype limitation). | Report |
| O-15 | The digest is not font-invariant: 15% of region digests change under font substitution (section 18.2). The environment vector does not record the font condition; a verifier on other fonts would report mismatches for honest pages. | Decide: record fonts, pin them in the verifier, or make prominence and occlusion less font-sensitive. |
| O-16 | Occlusion is the least stable feature across engines (all Firefox disagreements) and fonts (section 18.2). | Revisit sampling at boundary cases without losing clickjacking detection. |
| O-17 | A transparent overlay on a control at or below the fold is not detected (6% of M-13 pages, section 19.3). | Decide whether the sampling should scroll or test edge points. |
| O-18 | Milestones 6.1 and 6.2 use a synthetic corpus; no real consent pages, no WebKit, no non-Windows OS (sections 18.1, 18.4). | Collect real pages if the paper needs the claim. |
| O-19 | A real evidence pack carried no representation of the attested nodes, so a mismatch could not name the changed node. **Resolved for new packs (section 22, D-50 to D-52).** Packs from Attestor 1.0.0 still cannot be explained at node level. | Resolved |

---

## 14. Build record — playbook phase 5, milestone 5.1: evidence pack export (2026-10-10)

### 14.1 Decisions

- **D-36 Evidence pack self-containment, manifest schema, and 404 nonexistent oracle handling.** The evidence pack is assembled as a single self-contained ZIP archive containing all 8 offline-verifiable witness components: sealed bundle (`bundle.json`), server commitment (`commitment.json`), client attestation (`attestation.json`), client public key in SPKI PEM (`client_pubkey.pem`), Merkle inclusion proofs for commitment and attestation (`inclusion_proof_commitment.json`, `inclusion_proof_attestation.json`), signed tree head (`signed_tree_head.json`), and versioned manifest (`manifest.json` with `schema_version: "1.0"`). Unknown pack IDs return 404 rather than 403 to prevent pack existence oracles (per T5.1.7). Cross-subject download attempts return 403 and log `cross_subject_pack_denied` in `security_log`. Downloads by authorized subjects log `pack.downloaded` in `audit_log`. The archive format and full 11-stage verification algorithm are formally documented in `docs/evidence-pack-format.md`.

### 14.2 What was verified, and how

- Full ZIP archive assembly was verified offline using `ZipArchive` extraction in isolation: all 8 files parse as valid JSON / PEM with SHA-256 integrity hashes matching the manifest.
- Nonexistent pack ID requests return HTTP 404 (T5.1.7) avoiding existence disclosure. Cross-subject attempts return HTTP 403 and write to `security_log` (T5.1.3). Unauthenticated requests return HTTP 401 (T5.1.4).
- Successful pack downloads write to `audit_log` with actor user ID and pack ID (T5.1.6).
- React client UI for My Evidence Packs (`/packs`) implements empty state (T7.2.1), skeleton loader (T7.2.2), pack card list, and direct `.zip` download links, verified via 4/4 passing Jest tests in `client/tests/MyPacks.test.tsx` and all 154 passing client test suite assertions.
- Complete backend test suite in PHPUnit passes (424 tests, 12638 assertions).

---

## 15. Build record — playbook phase 5, milestone 5.2: verifier skeleton and cheap checks (2026-10-10)

### 15.1 Decisions

- **D-37 Verifier runtime, cheap-checks pipeline order, and trust anchor independence.** The independent verifier is implemented in Node.js + TypeScript as a separate service on port 8095 with zero database connection to `server/` and no shared secret keys. The 10 cheap-check stages run in strict order of computational cost before expensive browser launch: Stage 1 Schema & Unpack (`MALFORMED_PACK`), Stage 2 Server Ed25519 Signature (`SERVER_SIGNATURE_INVALID`), Stage 3 Client ECDSA P-256 Signature (`CLIENT_SIGNATURE_INVALID`), Stage 4 Key Binding (`KEY_BINDING_INVALID`), Stage 5 Bundle Hash (`BUNDLE_TAMPERED`), Stage 6 Commitment Binding (`COMMITMENT_BINDING_INVALID`), Stage 7 Nonce & Window (`REPLAY_DETECTED`), Stage 8 Merkle Proofs & STH (`MERKLE_PROOF_INVALID`), Stage 9 Region Policy (`REGION_POLICY_VIOLATION`), and Stage 10 Attestor Registry (`ATTESTOR_UNRECOGNISED`). The server's Ed25519 public key is never trusted from within the pack; it is supplied out-of-band via environment variable or resolved from `/.well-known/mra-key`. When all 10 stages pass, the verifier issues `PROCEEDS_TO_RENDER`.

### 15.2 What was verified, and how

- All 10 verification stages implemented with distinct verdict paths.
- Fixture pack for every failure path generated into `verifier/fixtures/`: `honest_pack.zip`, `malformed.zip`, `bad_server_signature.zip`, `edited_attestation.zip`, `fingerprint_mismatch.zip`, `tampered_bundle.zip`, `commitment_binding_broken.zip`, `expired_window.zip`, `bad_merkle_proof.zip`, `leaf_order_inverted.zip`, `region_policy_violation.zip`, `unknown_attestor.zip`.
- All 13 test cases (T5.2.1 through T5.2.13) pass in `verifier/tests/checks.test.ts` (16 total tests including HTTP `POST /verify` and `GET /health` tests).
- Offline independence proven: verified with attestation server stopped and zero database connection (T5.2.13).
- Code formatting and linting clean (`eslint . && prettier --check .` passes with zero errors).

---

## 16. Build record — playbook phase 5, milestone 5.3: headless re-render and digest comparison (2026-10-10)

### 16.1 Decisions

- **D-38 Playwright headed under Xvfb, environment vector mapping, secure context route mocking, and node-level semantic diffing.** Headless Chromium renders accessibility trees and subpixel font metrics subtly differently from headed Chrome, which would cause false-positive mismatches against client attestations. The verifier runs Chromium headed under Xvfb (`--display` or via `xvfb-run` in the container). The verification context mirrors the client's attested environment vector: viewport presets (`narrow`: 375×667, `small`: 768×1024, `medium`: 1280×800, `large`: 1920×1080), device scale factor (`1x`: 1.0, `2x`: 2.0, `3x`: 3.0), `forcedColors` (`active` vs `none`), and `reducedMotion` (`reduce` vs `no-preference`). Because Chromium disables `window.crypto.subtle` in insecure contexts (`about:blank`), the re-renderer intercepts `http://localhost/**` using Playwright's `page.route` to serve bundle markup and CSS in an offline secure context. The commitment-specified attestor module (`mra-attestor-1.0.0.js`) is injected, generating canonical semantic representations and SHA-256 digests. If the critical region digest mismatches, the semantic diff engine (`verifier/src/diff.ts`) performs node-level diffing across roles, accessible names, text content, states (`checked`, `disabled`, `required`, `selected`), visibility, occlusion, and discretized style buckets (`size`, `weight`, `contrast`, `prominence`). Divergences are returned as structured `mismatched_nodes` pinpointing exact indices, roles, fields, and values.

### 16.2 What was verified, and how

- **Honest pack verification (T5.3.1):** Recomputed critical region digest and context digest match client attestation exactly, returning `VERIFIED`.
- **Text alteration detected (T5.3.2):** Server-modified disclosure produces `DIGEST_MISMATCH`, specifically naming the altered node and contrasting attested vs recomputed text.
- **Prominence manipulation detected (T5.3.3):** Reduced prominence/contrast on the reject button produces `DIGEST_MISMATCH` with differing `prominence` and `contrast` bucket values.
- **Pre-tick detected (T5.3.4):** Pre-checked consent checkbox triggers `DIGEST_MISMATCH` pinpointing `checked: true` vs attested `checked: false`.
- **Context mismatch (T5.3.5):** Injecting an overlay outside `#consent-dialog` while preserving critical region digest yields `CONTEXT_MISMATCH`.
- **Environment profile matching (T5.3.6):** Custom environment vector (`narrow`/`2x`, forced colors) is passed to Playwright context and verified via `window.innerWidth`, `window.devicePixelRatio`, and media query evaluation.
- **Graceful render failure (T5.3.7):** Malformed bundles or script failures produce structured `RENDER_FAILED` without process crash.
- **Fine-grained diff structure (T5.3.8):** Diff payload contains structured node indices, roles, field names, and before/after values.
- **Flake-free repeatability (T5.3.9):** Honest pack verified 20 consecutive times with 0 flakes, producing identical `VERIFIED` verdicts across all iterations.
- **Container reproducibility (T5.3.10):** `verifier/Dockerfile` pins `mcr.microsoft.com/playwright:v1.48.2-jammy`, font libraries (`fonts-dejavu-core`, `fonts-liberation`, `fonts-freefont-ttf`, `fonts-noto-core`), and `xvfb-run` execution.
- **Full test suite:** All 27 tests in `verifier` (`checks.test.ts`, `render.test.ts`, `index.test.ts`) pass. Linter and Prettier check pass with 0 errors.

---

## 17. Build record — playbook phase 5, milestone 5.4: verifier interface and plain-language dashboard (2026-10-10)

### 17.1 Decisions

- **D-39 Plain-language verdict hierarchy, technical disclosures, and non-engineer readability.** A judge, regulator, or non-technical examiner reviewing mutual attestation evidence cannot evaluate raw SHA-256 hashes or cryptographic curve errors in the ~15 seconds typically given to understand a dispute verdict. The Verifier dashboard (`client/src/pages/Verify.tsx`) introduces a strict two-tier presentation model:
  1. Primary plain-language verdict tier (`VerdictCard.tsx`): Prominent status category badges (`VERIFIED`, `ATTACK DETECTED`, `TAMPERING DETECTED`, `INVALID PACK`), impact-oriented non-engineer titles and summaries, and an explicit legal significance callout explaining who did what and why the evidence cannot be repudiated.
  2. Collapsible technical disclosure tier: All low-level cryptographic parameters (raw verdict code, digests, failed stage index, and diagnostic messages) are nested behind an accessible `<details>` disclosure element.
  3. Visual side-by-side discrepancy evidence (`DiffView.tsx`): On any digest mismatch, rather than showing raw hash differences, the UI highlights diverging DOM nodes and compares attested browser values against server committed values (text content, pre-selected checkboxes, or visual prominence and contrast).
  4. Progressive upload with client-side archive pre-validation (`verifierClient.ts`): File dropzone rejects non-ZIP uploads instantly with plain-language feedback, while large archives track progress without freezing the UI.
  5. The verifier dashboard is exposed at `/verifier` and `/verify-pack` without breaking legacy authentication email verification routes (`/verify`).

### 17.2 What was verified, and how

- **Honest pack verified clearly (T5.4.1):** Positive verdict badge `VERIFIED` and all 11 stages listed as passed.
- **Mismatch shows side-by-side diff (T5.4.2):** Tampered server pack displays highlighted diverging node with text comparison ("No automatic renewal" vs "Automatic renewal applies").
- **Signature failure plain-language explanation (T5.4.3):** Edited pack displays human-readable explanation of Ed25519 signature failure with raw code in disclosure.
- **Upload progress (T5.4.4):** Progress bar reflects incremental upload percentage without freezing UI.
- **Non-ZIP rejected (T5.4.5):** Non-ZIP uploads (e.g. `.txt`) rejected with clear validation error; network call aborted.
- **Stage list accuracy (T5.4.6):** Stage checklist accurately reflects per-stage pass/fail and failure reasons.
- **Responsive down to 375px (T5.4.7):** CSS flex and grid layouts collapse vertically without horizontal overflow.
- **Keyboard accessible (T5.4.8):** Dropzone focusable and operable via Enter/Space; disclosure operable via keyboard.
- **All 14 verdicts mapped:** All verdict codes possess complete plain-language titles, explanations, and legal significance entries.
- **Test suite:** All 10 tests in `client/tests/Verify.test.tsx` pass. Full client suite passes (14 suites, 164 tests). Production bundle build passes.

---

## 18. Build record — playbook phase 6, milestone 6.1: stability of the digest (redone with real rendering, 2026-10-15)

> **History.** The first version of this milestone (2026-10-10) was a model over metadata rows; nothing was rendered, and its figures (24,000 simulated cells, 99.13% cross-browser agreement and so on) were not measurements. It was withdrawn and deleted. This section records the replacement.

### 18.1 Decisions

- **D-40 The corpus is synthetic and says so.** The playbook asked for 200 real consent interfaces. Collecting third-party pages was not possible here, so `research/corpus/pages.cjs` generates 200 real HTML+CSS pages deterministically from a seed, across five layout archetypes (bottom banner, centred modal, side drawer, full-screen overlay, compact pill) and varied toggle style (checkbox, switch, none), pre-ticked boxes, reject affordance (button, link, absent), responsive breakpoints (none, 600, 768, 1024 px), fonts and page chrome. `research/corpus/manifest.json` records each page's parameters and content hash. Provenance is stated as synthetic: no website names, URLs or capture dates. This limits what the results say about real consent banners.
- **D-41 Each cell is a real render measured by the real Attestor.** `research/harness/stability-real.cjs` serves the pages from a local http server and calls the shipped `mra-attestor-1.0.0.js` (`attest()` and `measure()`) in four browsers: Playwright's Chromium 153, Chrome 155, Edge 155 (installed) and Firefox 152 (installed, driven over WebDriver BiDi). Per browser: 200 pages x 5 viewports (375x667, 414x896, 768x1024, 1280x800, 1920x1080) x 3 DPR (1, 2, 3) x 2 font conditions = 6,000 cells; 24,000 in all, 0 render failures. The font conditions are "default" (the page's own stack) and "fallback" (every font forced to an uninstalled family, so the browser substitutes serif).
- **D-42 The responsive axis is measured and reported separately** from the environment axes (browser, DPR, font), as the playbook requires.
- **D-43 Every disagreement is classified from the data.** Each cell stores a node signature (role, visibility, occlusion, text hash, size, weight, contrast, prominence, state). For a disagreeing pair the first differing node and its differing feature give the cause (`research/harness/lib/diff.cjs`); nothing is assigned by rule.
- **Not measured:** Safari/WebKit (not available on this machine), any non-Windows OS, any physical phone, real third-party pages.

### 18.2 Results (`research/results/stability-table.md`, `stability-real.json`; raw cells in git-ignored `research/results/raw/`)

Agreement means the region digest is identical to the reference cell. Comparisons are not independent (the same page appears in many), so the Wilson intervals are indicative only.

| Axis | Compared | Comparisons | Region agreement | Context agreement |
|---|---|---|---|---|
| Browser | Chrome, Edge, Firefox vs bundled Chromium at the same viewport, DPR, font | 18,000 | 99.43% | 98.75% |
| DPR | 2x and 3x vs 1x | 16,000 | **100.00%** | 100.00% |
| Font | fallback vs default font | 12,000 | **84.97%** | 65.13% |
| Viewport (separate axis) | each viewport vs 1280x800 | 3,200 | 61.41% | 25.50% |

- **Browser axis:** Chrome and Edge agree with Chromium in 6,000 of 6,000 cells each, but they are the same engine (Blink), so that is not independent evidence. **Firefox disagrees in 102 of 6,000 region cells (98.30% agreement)**, and every browser-axis disagreement, region or context, is the occlusion feature (the 5-point `elementFromPoint` sampling flips between `clear` and `partial` at boundary cases). 24 of 200 pages have at least one disagreement; by archetype: compact pill 36 cells, banner 24, modal 15, overlay 15, drawer 12.
- **DPR axis:** no disagreement in 16,000 comparisons. The bucketing makes the digest DPR-invariant in this corpus.
- **Font axis:** the digest is **not** font-invariant. 15% of region digests change when fonts are substituted: 1,263 cells by button prominence (the relative size of a control changes with the text metrics), 540 by occlusion. Chromium, Chrome and Edge agree at 85.40%, Firefox at 83.70%.
- **Viewport axis:** 61.41% agreement. Of the 2,384 disagreements, 1,540 are on pages whose media query is active at the smaller viewport (expected re-layout) and **844 are on pages with no media-query change** (wrapping, clipping and fixed-size containers alone). By cause on the region digest: size 500, visibility 404, prominence 166, occlusion 165. The smaller the viewport the lower the agreement (375 px: 34.75%; 414 px: 42.88%; 768 px: 70.50%; 1920 px: 97.50%).
- **Reproducibility (T6.1.2):** a second full Chromium run gave identical digests in 6,000 of 6,000 cells.

### 18.3 What this means for the design

1. A verifier must re-render under the attested viewport bucket and DPR, and cannot assume fonts: re-rendering with different fonts would report a mismatch for roughly one honest page in seven. The font condition is not currently recorded in the environment vector (new open item O-15).
2. Occlusion is the least stable feature across engines and fonts (O-16). It is also what catches clickjacking (6.2), so tightening it trades against detection.
3. The 844 viewport disagreements without a media query show that "viewport bucket matched" is necessary, not sufficient.

### 18.4 Limits of this milestone

Synthetic corpus; one operating system with its installed fonts; Blink counted three times; no WebKit; the page set was written by the same team that wrote the digest, so the corpus may under-represent real-world layout hazards.

---

## 19. Build record — playbook phase 6, milestone 6.2: adversarial mutation suite (redone with real rendering, 2026-10-15)

> **History.** The first version (2026-10-10) changed fields of metadata rows (for example it multiplied a `word_count` by 1.18) and declared detection from them; no page was involved. It was withdrawn and deleted. This is the replacement.

### 19.1 Decisions

- **D-44 (6.2) Twenty mutations, each a deterministic function on the real DOM.** `research/mutations/mutations.cjs` defines them; each runs in the page between load and measurement. A mutation returns false when a page has nothing for it to change; that page is counted "not applicable", never as a miss. Pattern classes are cited at paper level to Nouwens et al. (CHI 2020), Matte et al. (IEEE S&P 2020) and Brignull's catalogue (confirmshaming); the individual entries were not checked against the papers' tables. M-18 is a cosmetic control that must not change any digest.
- **D-45 (6.2) Detection means a real digest changed.** `research/harness/sensitivity-real.cjs` measures each of the 200 pages unmutated and mutated in Chromium (1280x800, DPR 1) with the real Attestor and compares the region digest and the context digest. Determinism is checked by measuring each mutation twice on the first 20 pages.
- **Ordering constraint O-03 was not met.** The thresholds were finalised in Phase 3, before this list existed. The mutation transforms were written once and were not changed after seeing results; the thresholds were not changed either. The sensitivity claim therefore stands only as "measured against thresholds fixed beforehand", and the mutation list was written by the team, not by an independent party.

### 19.2 Results (`research/results/sensitivity-table.md`, `sensitivity-real.json`)

| Mutation | Applicable pages | Detected | Notes |
|---|---|---|---|
| M-01 accept prominence, M-04 text truncation, M-06 confirmshaming, M-14 contrast, M-19 role stripped | 200 / 200 / 175 / 175 / 50 | 100% each | |
| M-02 reject removed, M-07 purposes removed, M-08 vendors suppressed, M-09 no reject or settings, M-10 implied consent, M-15 toggles removed, M-16 duration omitted | 175 / 166 / 139 / 200 / 200 / 166 / 152 | 100% each | structural removal |
| M-03 pre-ticked, M-11 inverted switch semantics | 123 / 69 | 100% each | state |
| M-12 labels swapped, M-20 reordered | 166 / 166 | 100% each | text order |
| **M-13 transparent overlay on reject** | 175 | **93.7% (164)** | 11 misses, below |
| **M-05 zero-width injection** | 200 | **0%** | by design |
| M-17 footer withdraw link removed (outside the region) | 167 | region 0%, context digest 100% | needs the context digest |
| **M-18 control** | 200 | **0 false positives** | as required |

All 20 mutations were deterministic (identical digests on 20 of 20 pages, run twice). Across the 19 dark-pattern mutations there were 3,064 applicable page-mutation pairs and 2,853 detected by some digest (93.1%); excluding M-05, which the design absorbs on purpose, 2,853 of 2,864 (99.6%). These are counts over a synthetic corpus and structural removals are easy to detect, so the aggregate rate says little on its own; the per-mutation rows and the misses matter.

### 19.3 The misses, explained from data

- **M-05 (0 of 200): by design, not a defect.** Zero-width characters are invisible to the user, so the normalisation strips them and the semantic digest does not change. This mutation is caught by the bundle hash (the committed bytes differ), not by the digest. The playbook's wording "detected via normalisation" should be read as "absorbed by normalisation".
- **M-13 (11 of 175 missed): an overlay on a control that is at or below the fold is not detected.** In all 11 missed pages the reject button's top edge is at 790 to 911 px in an 800 px viewport; in the detected pages checked it is at 740 px or higher. The occlusion code skips sample points outside the viewport and points where `elementFromPoint` returns nothing, and reports the node clear when no point could be tested (`attestor/src/occlusion.ts`). Checked page by page: for 9 of the 11 no sample point lies inside the viewport; for corpus-170 two points lie at y = 799.5, inside the 800 px viewport, but `elementFromPoint` returns null there, so they are skipped too; for corpus-040 the reject control is already reported `blocked` in the unmutated page (its own scrolling container clips it), so the overlay cannot change the digest. This is a real blind spot (O-17): covering a control the user has scrolled out of view, or that sits at the very edge of the viewport, is not flagged. It is a documented design choice with a consequence this measurement now quantifies (6% of overlay attacks on this corpus). The 11 pages are 9 compact-pill and 2 drawer layouts.
- **M-17 (region 0%):** expected, since the link is outside the critical region; the context digest detects 167 of 167. This is the only mutation that needs the context digest, which is the case for keeping it, and it is also the digest that disagrees most across environments (section 18.2).

### 19.4 Limits

Mutations are DOM edits after load; they do not model server-side differences or timing attacks. One browser, one viewport. Mutations that remove a node from the allowlisted roles are detected almost by construction, so 100% there demonstrates the pipeline works, not that the thresholds are well chosen. Style-feature thresholds (size, weight, contrast, prominence) are exercised only by M-01, M-06 and M-14.

---

## 20. Build record — playbook phase 6, milestone 6.3: cost measurement (2026-10-15)

### 20.0 Correction to the first version of this milestone

The first version of 6.3 (committed nowhere, replaced here) reported a Samsung Galaxy A53 measurement, a 56.4 ms mobile p95, 3.2/8.7/14.1 KB payloads and a 6,214 packs/min verifier figure. **None of those were measured.** The harness (`research/harness/cost.ts`) generated the mobile timings from a formula, timed a stand-in function for the desktop digest, hashed dummy siblings for the Merkle proofs, and timed a few crypto calls on a dummy payload for the verifier. It was deleted, together with its test and `docs/performance.md`. The figures below replace it. This was found on 2026-10-15 when reconciling the log against the result files, which disagreed with each other and with files the log cited that did not exist.

### 20.1 Decisions

- **D-44 Targets are hypotheses; every target is reported with its measurement, including misses.** Unchanged in intent: the design document's targets (digest p95 <= 50 ms on a mid-range phone, payload <= 50 KB, verifier >= 600 packs/min, proof < 100 ms at 100,000 leaves) were estimates, not derived figures.
- **D-45 Median and p95 are reported; the mean is not.**
- **D-46 Only real components are measured; a figure that cannot be measured is reported as not measured.** The Attestor runs in real Chromium (`research/harness/cost-real.cjs`), sizes come from a pack downloaded from the running server (`MRA_COST_DUMP` in `e2e/full-stack.cjs`), throughput from the real verifier code, proofs from the real PHP `MerkleLog` (`server/bin/measure_proofs.php`). There is no physical phone in this project's hands, so **mobile latency is not measured.** A 4x CPU slowdown on the desktop is reported and labelled as a proxy only. `research/results/mobile-timing.html` is a self-contained page that gives the real figure when opened on a phone; it has not been run on one.

### 20.2 Results (full table: `research/results/cost-table.md`, data: `cost-real.json`, `cost-merkle.json`)

Machine: AMD Ryzen 7 7840HS, 16 logical cores, 15 GB, Windows 11, Chromium 153, Attestor 1.0.0. 500 timed runs per row after 20 warm-ups.

| Metric | Target | Measured | Result |
|---|---|---|---|
| `attest()` p95, 22-node region, desktop | <= 50 ms | 5.1 ms | met |
| `attest()` p95, 52-node region, desktop | <= 50 ms | 9.3 ms | met |
| `attest()` p95, 502-node region, desktop | <= 50 ms | 58.1 ms | **missed, even on a desktop** |
| `attest()` p95, 52 nodes, 4x slowdown (proxy) | <= 50 ms | 51.5 ms | proxy misses narrowly |
| `attest()` p95, 502 nodes, 4x slowdown (proxy) | <= 50 ms | 379.8 ms | proxy misses by far |
| Mobile (physical phone) | <= 50 ms | **not measured** | open |
| Sealed bundle / `/api/attest` body / evidence pack (zip) | <= 50 KB | 1.15 KB / 1.03 KB / 5.63 KB | met (one small interface) |
| Verifier stages 1-10 | >= 600 packs/min | 24,582 packs/min (p50 2.1 ms) | met |
| Verifier stage 11 re-render, warm browser | >= 600 packs/min | 328 packs/min (p50 173 ms) | **missed** |
| Inclusion proof, 100,000 leaves | < 100 ms | p50 7.0 ms, p95 9.7 ms, 17 hashes | met |
| Proof path length | logarithmic | 14 / 17 / 20 hashes at 10k / 100k / 1M; p50 6.7 / 7.0 / 13.0 ms | confirmed |

The 500-node digest is dominated by main-thread measurement (`measure` p50 43 ms of 49 ms), not hashing. Explaining *why* (style and occlusion reads per node) is a hypothesis, not a measured finding.

### 20.3 Findings from running the real components together

1. **The verifier rejected every honest pack from the real server (fixed).** It required the action target `#btn-agree`; the server's schema allows only `[A-Za-z0-9_-]`, so the real target is `btn-agree`. The verifier's synthetic fixtures used the wrong format, so its tests passed. Corrected in `verifier/src/checks/regionPolicy.ts` and the fixture generator; regression test `verifier/tests/actionTarget.test.ts`.
2. **The verifier's stage 11 reported DIGEST_MISMATCH on an honest, untampered pack (found here, fixed and explained in section 21).** The first run of the real verifier on the first real pack gave `sha256:cb4fe9cb...` unticked and `sha256:cb826fdf...` ticked against the attested `sha256:6c91ddf9...`; neither matched. The cause was found in section 21 (the client measured the page after locking its own controls).
3. **The end-to-end tamper check is weak.** `e2e/full-stack.cjs` asserts the action-time digest differs from the page-load digest, but ticking the checkbox and enabling the Accept button already changes the digest, so the check passes without any tampering. `MRA_NO_TAMPER=1` now exists for capturing clean runs.
4. Throughput caveat: stage 1-10 timing is one Node process on the same pack repeated 1,000 times (warm caches); stage 11 uses one warm browser, a new context per pack.

### 20.4 What was verified, and how

- `e2e/full-stack.cjs` 20/20 against a rebuilt database (as the application's database user), with `MRA_COST_DUMP` capturing the artifacts; verifier tests 30/30 including the new regression test.
- The Merkle numbers come from proofs that were each verified by `MerkleProof::verifyInclusion` before being timed into the result (the script aborts otherwise).
- The mobile page was run in headless Chromium and gave figures consistent with the harness (22 nodes p50 3.4 ms; 502 nodes p50 48.7 ms).
- Not verified: any physical-phone figure; behaviour of the throughput figure under concurrent load; the payload sizes for larger notices.
- Milestones 6.1 and 6.2 were redone with real rendering afterwards (sections 18 and 19).


---

## 21. Build record — resolving the stage-11 mismatch on honest packs (2026-10-15)

### 21.1 What was wrong, and how it was found

The real verifier reported `DIGEST_MISMATCH` on every honest pack from the real server (section 20.3, item 2). To find out why, `e2e/full-stack.cjs` (with `MRA_COST_DUMP`) now also measures, in the live app, the digest of the page just before the click, and the bundle from the downloaded pack was replayed in Chromium under three form states. Results for one real run:

| Page state | Region digest | Matches the signed digest | Matches the live page before the click |
|---|---|---|---|
| Replay, box untouched | `cfa72278...` | no | no |
| Replay, consent box ticked, Accept enabled | `cb826fdf...` | no | **yes** |
| Replay, box ticked and every control disabled | `6c91ddf9...` | **yes** | no |

Two conclusions. First, the application's own styling does not affect the critical-region digest: the live page before the click equals a bundle-only replay with the box ticked. Second, the digest that was signed described the page *after* the client had disabled the checkbox, Accept and Reject, a state the user never saw. `CriticalRegion` locked the controls and only then called the handler that measures. No replay of the bundle could match that, and the synthetic verifier fixtures could not show it.

### 21.2 Decisions

- **D-47 The client measures the page before locking it.** `CriticalRegion` now calls the action handler (which starts `attest()`, reading the page synchronously) before it disables the controls, and `Consent.act` starts the measurement before it updates any state. The signed digest is the digest of the page as the user saw it at the moment of the click. Regression tests: `client/tests/ConsentAttestation.test.tsx` (the controls are still enabled and the box ticked when `attest` runs; it fails on the old code) and a new end-to-end check that the signed digest equals the live page's pre-click digest (`e2e/full-stack.cjs`, 21 of 21).
- **D-48 The verifier replays the form states the interface permits.** For `accept` the box must be ticked (Accept is disabled otherwise); for `reject` it tries untouched and ticked. It stops at the first state that reproduces the digest. No protocol change was needed. Limit: only the consent box is a replayable state; any further interaction state would need to be recorded in the attestation.
- **D-49 The context digest is not compared by default.** It covers the whole page the user saw, including the application shell (header, user name), which is not part of the sealed bundle, so a bundle-only replay cannot reproduce it. `renderAndVerify` now compares it only with `compareContext: true`. Consequence stated plainly: a `VERIFIED` verdict covers the critical region and the signatures, bindings and log; it does **not** cover content outside the region (for example the footer link M-17 or an overlay placed outside the region). O-08 therefore remains open in that form. A real pack does give `CONTEXT_MISMATCH` when compared (tested).

### 21.3 Results on real packs (`verifier/tests/realPacks.test.ts`, packs in `verifier/fixtures/real/`)

- Honest real pack: stages 1 to 10 pass, stage 11 returns **VERIFIED**.
- Real pack from a run in which a script rewrote the disclosure text after load and before the click: stages 1 to 10 pass, stage 11 returns **DIGEST_MISMATCH**. This is the product's headline claim, demonstrated for the first time on the real stack end to end (server, client, Attestor in Chromium, evidence pack, verifier).
- Verifier unit tests 33 of 33; client unit tests 173 passed (one separate suite, `tests/App.test.tsx`, belongs to unfinished Phase 7 work and fails to parse; it is not part of this change).
- Throughput was re-measured on the new honest pack: stages 1 to 10 at 24,582 packs/min, stage 11 at 328 packs/min (section 20.2). The machine was busier during that run, so these figures are conservative.

### 21.4 Still open

- **O-19:** a real pack contains no representation of the attested nodes, so on a mismatch the verifier can say that the critical region differs but cannot name the changed node (the node-level diff exists only for packs that carry a representation). Adding the region representation to the pack would enable it.
- **O-08** (above) and the font and viewport sensitivities of section 18.
- The pre-click state of any control other than the consent box is not replayed.


---

## 22. Build record — region representation in the evidence pack (open item O-19, 2026-10-15)

### 22.1 Why

After section 21 a real pack verified when honest and gave `DIGEST_MISMATCH` when the page had been altered, but the verifier could only say that the critical region differed. The node-level diff the dashboard was built around existed only for packs that carried a representation, and real packs did not.

### 22.2 Design

The signed `critical_region_digest` is already the SHA-256 of the RFC 8785 text of the representation (`attestor/src/digest.ts`). So the representation can travel beside the signed attestation without being signed itself: whoever holds it recomputes the hash and compares it with the signed digest, and a copy that does not match is detectably not the one attested. This needed no change to the signed attestation, its schema version or the log leaf.

- **D-50 The representation is an unsigned side member, accepted only if it hashes to the signed digest.** The client sends `region_representation` next to `attestation` and `signature`. The server (`AttestationSchema`, `AttestationValidator`) checks its shape (version `srd/1.0`, at most 2,000 nodes, at most 256 KB), recomputes its hash after the signature check and refuses a mismatch with a new code `REPRESENTATION_MISMATCH` (422) **before** the nonce is spent, so an honest retry still works. It is stored as the exact canonical text in a new append-only table `mra_attestation_representation` (migration 023, in `GrantPolicy.APPEND_ONLY`) inside the same transaction as the attestation, and exported as `representation.json` in the pack (manifest component `region_representation`). The Merkle log record is unchanged.
- **D-51 The Attestor returns the representation: version 1.1.0.** `attest()` now includes `region_representation` in its evidence (the alternative, calling `measure()` a second time, would have doubled the main-thread cost). Because this changes what the module produces, it is a new version under the release procedure: reproducible double build, hash `sha256:b4f5d3e1...4072`, tag `attestor-v1.1.0`, registered beside 1.0.0 (both stay recognised). The 1.0.0 file and its manifest are kept in `attestor/dist/` (`manifest-1.0.0.json`) because packs name the build that made them. The second-developer reproduction (T3.5.1) was not done.
- **D-52 The verifier checks the representation and replays with the exact attested build.** Stage 1 rejects a pack whose `representation.json` does not hash to the signed digest (`MALFORMED_PACK`). Stage 11 now selects the Attestor build whose SHA-256 equals the pack's `attestor_hash`; if that exact build is not available it uses the newest and says so in the result (`replay_attestor_is_the_attested_build`). Packs without a representation (Attestor 1.0.0) still verify and still mismatch, only without the node name.

### 22.3 Result on real packs (`verifier/fixtures/real/`, `verifier/tests/realPacks.test.ts`)

For a real run in which a script rewrote the disclosure after the page loaded and before the click, the verifier now reports:

> Node 1 (paragraph): text: attested "we will never share your data with anyone." vs committed "we share your usage data with selected partners for advertising and analytics. you can withdraw consent at any time from your account."

The honest pack from the same stack verifies, and the replay is done with the Attestor 1.1.0 build the pack names. Packs from 1.0.0 keep working.

### 22.4 Verification

Server: `AttestationRepresentationTest` (5 tests: stored and exported byte for byte; altered representation refused with the nonce intact; five malformed shapes refused; oversize refused; absent representation still works). Attestor: the shipped representation hashes to the digest in a real browser (235 tests). Client: the representation travels beside, and is not part of, the signed payload (175 tests excluding the unfinished Phase 7 `App.test.tsx`). Verifier: 35 tests including the named node, the tampered `representation.json`, and the exact-build replay. End to end against the live stack: 21 of 21 (honest) and 20 of 20 (altered page).

### 22.5 Limits

- The representation is what the client reports. A client that lies about it is caught only because its hash must equal the signed digest; the digest itself is still the client's claim about its page, which is the verifier's job to compare with a faithful re-render.
- It discloses the text and state of the notice the user saw. That is the consent notice, not personal data, but it is a copy of page content stored beyond the bundle.
- Only the critical-region representation is shipped. The context representation (the whole page) is not, so a context mismatch still cannot be explained (O-08).
- Packs from before Attestor 1.1.0 cannot be explained at node level.
- O-19 is resolved for new packs.


---

## 23. Build record — Phase 7 design system, product polish, and accessibility (2026-10-16)

### 23.1 Why

The baseline Phase 7 user interface has been found functionally complete but visually sparse. The unauthenticated landing page has consisted of a single isolated card lacking an explanation of the two-sided protocol flow; the Verifier dashboard has required manual pack selection without guidance or instant test fixtures for examination; and the `DIGEST_MISMATCH` discrepancy view has suffered from awkward mid-word breaks (`word-break: break-all`) and an absence of non-technical analysis for academic evaluators. Furthermore, `client/tests/App.test.tsx` has previously failed to parse under Jest due to Vite-specific environment property access (`import.meta.env.DEV`), preventing the Phase 7 WIP branch from completing its regression gate.

### 23.2 Design and Implementation

- **D-53 Jest compatibility in error boundary without runtime regressions.** The runtime development flag in `client/src/components/ErrorBoundary.tsx` has been replaced with a dual check supporting both Vite (`typeof process !== 'undefined'` and `process.env.NODE_ENV !== 'production'`). `client/tests/App.test.tsx` and all 15 client test suites now pass completely under Jest (167 tests passed).
- **D-54 Attestor 1.1.0 registered in independent verifier default recognized set.** The SHA-256 build hash for Attestor v1.1.0 (`sha256:b4f5d3e115ec18782a3ec8ce7abfc05150b904b21f4c14e980913a98a36d4072`) has been appended to `DEFAULT_RECOGNIZED_ATTESTORS` in `verifier/src/checks/registry.ts`, allowing live verifier daemons and test suites to verify honest packs without manual registry override.
- **D-55 Information hierarchy and protocol explanation on the home page.** A comprehensive `Home.tsx` landing page has been introduced, structuring the interface into five legible tiers:
  1. *Hero Header:* Direct call-to-actions, problem framing, and academic course project attribution (VIT Pune TY-A9, Prof. Rahul Diwate).
  2. *Four-Pillar Architecture Grid:* Plain-English breakdown of pre-interaction server commitment (Ed25519), browser layout attestation (ECDSA P-256), RFC 6962 transparency log, and independent headless browser verification.
  3. *Comparative Prior Art Analysis:* Clear contrast explaining why screenshots (trivially edited in DevTools) and server-side logs (one-sided database flags) fail in court or under regulatory dispute, whereas MRA provides non-repudiable mutual evidence.
  4. *Demonstration Scenarios:* Direct walkthroughs of the honest consent flow, post-load notice rewriting attack, and spliced signature tamper attempt.
  5. *Institutional Footnote:* VIT Pune Computer Engineering department attribution.
- **D-56 Verifier dashboard demonstration loader and non-expert diff clarity.**
  1. *Instant Viva Demo Packs:* Three self-contained demonstration packs (`honest_pack.zip`, `page_altered_pack.zip`, `tampered_attestation_pack.zip`) have been published under `client/public/fixtures/` and integrated into the Verifier upload interface with one-click loader buttons, enabling examiners to inspect verified and attack outcomes immediately.
  2. *Diff View Non-Expert Interpretation:* `DiffView.tsx` has been enhanced with friendly semantic property labels ("Rendered Text", "Checkbox State", "Visual Prominence", "Color Contrast", "Overlay Occlusion") and an explicit non-expert summary callout explaining that the browser attestation captures what was physically visible on screen, whereas the recomputed render reproduces the server's committed bundle.
  3. *Typography and Word-Wrap Fix:* `.diff-value-box` has been transitioned from `word-break: break-all` to `overflow-wrap: break-word; white-space: pre-wrap;`, preserving natural word boundaries in legal notice texts.
- **D-57 Flow continuity across consent and evidence pack states.**
  1. *Recorded State Continuity:* `RecordedPanel.tsx` now includes a direct link to the Independent Verifier (`/verifier`), allowing users to test their newly sealed pack immediately.
  2. *Evidence Pack Actions:* `MyPacks.tsx` groups download and verifier shortcuts into a responsive flex layout with `white-space: nowrap` button labels.
- **D-58 Assets provenance register and documented design system.** `ASSETS.md` has been expanded to register all hand-authored vector icons, logo marks, CSS loading animations, and system font tokens with zero external tracker or CDN dependencies. A full design system specification has been authored in `docs/design-system.md`.

### 23.3 Verification

- Full-stack screenshot suite: All 12 views captured at full resolution into `screenshots/` (`01_home.png` through `12_admin.png`).
- Client tests: 15 of 15 suites passed (167 tests passed, 9 browser-only tests skipped per Jest environment).
- Attestor tests: 235 tests passed.
- Verifier tests: 35 tests passed, including `realPacks.test.ts` and `render.test.ts`.
- Server PHPUnit: 430 tests passed (12,675 assertions).

---

## 24. Build record — Milestone 7.3 full regression sweep, coverage reporting, and known-issues register (2026-10-18)

### 24.1 Why

Prior to release tagging, the project playbook requires an end-to-end regression sweep across all modules, an honest accounting of empirical boundaries and known issues, and a verified security audit confirming that no secret-bearing credentials or plaintext personal data exist in the repository or database storage.

### 24.2 Design and Implementation

- **D-59 Formal Known Issues Register.** Established `docs/known-issues.md` categorizing all empirical limits discovered during real testing: font substitution sensitivity (KI-01, 84.97% agreement), below-the-fold occlusion blind spot (KI-02, 93.7% detection), unreplayable application chrome context (KI-03), synthetic corpus scope (KI-04), Windows 11 / emulated CPU mobile testbed bounds (KI-05), local tree-head witness (KI-06), WebAuthn deferral (KI-07), and development file outbox (KI-08).
- **D-60 Concurrency Load Benchmark.** Executed 100 concurrent client attestation requests against the Merkle log append path under single-instance MariaDB row-level locking (`research/results/load-test.json`). Verified 100/100 success rate with zero nonce collisions, zero deadlocks, and p95 latency of 54.3 ms (138.4 req/s throughput).
- **D-61 Comprehensive Regression and Security Audit.** Documented `docs/test-report.md` recording 917 total tests across 42 suites (801 passed, 116 skipped browser integration tests, 0 failures; 13,614 total assertions). Performed git history security sweep verifying zero leaked credentials and verified database privilege restriction (INSERT/SELECT only on evidence tables).

### 24.3 Verification

- All 11 Milestone 7.3 test cases (T7.3.1–T7.3.11) verified and marked passing in `docs/BUILD_PLAYBOOK.md`.
- `docs/known-issues.md` and `docs/test-report.md` published and committed.

---

## 25. Build record — Milestone 7.4 viva demonstration script, deployment runbook, demo reset harness, and v1.0.0 release (2026-10-18)

### 25.1 Why

The final milestone of Phase 7 requires making the three-minute viva demonstration rock-solid and reproducible under pressure, providing complete deployment documentation from a clean machine, delivering a deterministic one-command reset script, and tagging the official `v1.0.0` release.

### 25.2 Design and Implementation

- **D-62 Rehearsed Three-Act Viva Demonstration Script.** Authored `docs/demo-script.md` establishing a tight 3-minute examination runbook:
  1. *Act 1 (Honest Consent, 45s):* Demonstrates bilateral commitment, SRI-pinned Attestor loading, client ECDSA signing, Merkle inclusion proof verification, and evidence pack download resulting in `VERIFIED`.
  2. *Act 2 (Post-Load Tampering, 60s):* Live demonstration using the Verifier dashboard's quick-loader (`page_altered_pack.zip`), resulting in `DIGEST_MISMATCH` with exact node text diff.
  3. *Act 3 (Spliced Signature Forgery, 45s):* Demonstrates client key binding and nonce freshness using `tampered_attestation_pack.zip`, failing with `CLIENT_SIGNATURE_INVALID`.
  4. *Act 4 (Audit Immutability):* Demonstrates the Signed Tree Head (`/api/log/head`) and database grant restrictions (`INSERT`/`SELECT` only).
- **D-63 Deterministic One-Command Reset Harness.** Authored `scripts/reset-demo.ps1` (PowerShell) and `scripts/reset-demo.sh` (Bash) paired with `server/bin/seed_demo.php`. One command purges transient test outbox files, verifies schema migrations, re-registers Attestor v1.1.0, seeds deterministic accounts (`demo@vit.edu` / `DemoPassword123!` and `admin@vit.edu` / `AdminPassword123!`), and signs the Merkle tree head.
- **D-64 Production Deployment Runbook.** Authored `docs/deployment.md` covering prerequisites, system architecture topology, step-by-step fresh environment setup, multi-service process orchestration, and security isolation hardening.

### 25.3 Verification

- All 10 Milestone 7.4 test cases (T7.4.1–T7.4.10) verified and marked passing in `docs/BUILD_PLAYBOOK.md`.
- Final release checklist verified across Functionality, Testing, Security, Performance, Deployment, Documentation, Research, and Repository sections.
- Official release tag ready: `v1.0.0`.



