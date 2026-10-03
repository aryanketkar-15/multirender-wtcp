# PS-3 Mutual Render Attestation — Project Log

**Maintained by:** Group TY-A9, Department of Computer Engineering, Vishwakarma Institute of Technology, Pune
**Course:** Web Technologies
**Faculty:** Prof. Vidya Gaikwad
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
| Phase 2 | Attestor Module, semantic digest, stability harness | Not started |
| Phase 3 | Client signing, Merkle log, inclusion proofs | Not started |
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
| O-01 | Whether syllabus units III and IV must be demonstrated; if so the verifier moves from Node.js to Spring Boot | Prof. Gaikwad | Phase 4 |
| O-02 | Where signed tree heads will be published externally | Team | Phase 3 |
| O-03 | The fixed list of 20 adversarial mutations, to be settled before digest thresholds are implemented | Team | Phase 2 |
| O-04 | The end-to-end workflow in the design document does not yet include registration, OTP verification and login | Team | Report drafting |
| O-05 | The architecture diagram does not yet show the account layer | Team | Report drafting |
| O-06 | The Web Technology mapping table's authentication row predates the account layer | Team | Report drafting |
| O-07 | No dedicated database-layer section exists; connection handling, migrations and transaction policy are currently covered only by a single table row | Team | Report drafting |

---

## 8. Checklists

### 8.1 Mandatory course requirements

- [ ] Session management implemented and bound to attestation
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
- [ ] Semantic representation covers roles, text, state, visibility, occlusion and six bucketed styles
- [ ] Normalisation applies NFKC, case folding, whitespace collapse and zero-width stripping
- [ ] Critical region digest and context digest both computed
- [ ] Client key non-extractable; WebAuthn tier available where an account exists
- [ ] Attestation binds to the commitment hash, not the bundle hash
- [ ] Merkle commitment leaf appended at issue time
- [ ] Merkle attestation leaf appended at finalisation, referencing the commitment leaf
- [ ] Inclusion proofs generated and verified
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
