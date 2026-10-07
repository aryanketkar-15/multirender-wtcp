# PS-3 Mutual Render Attestation: progress briefing

Group TY-A9, Department of Computer Engineering, VIT Pune · Web Technologies · Faculty: Prof. Vidya Gaikwad

## 1. What the project is (30 seconds)

When you click "I agree" on a consent screen, who can prove what that screen actually showed?

Today, almost nobody can. The company keeps the record, and the company can edit its page, its logs, or both. If a dispute reaches a regulator (a subscription that auto-renewed, a loan fee, a cookie banner), the evidence is one-sided.

**Mutual Render Attestation** produces evidence that **neither side can forge alone**:

1. **Before** you interact, the server *commits* to the exact page it will show (a sealed, hashed bundle, signed with Ed25519).
2. **At the moment** you click, your browser computes a *semantic digest* of what is really on screen and signs it with a key the server never holds.
3. Both records go into an **append-only Merkle log** whose heads are published outside the server.
4. An **independent verifier** re-renders the committed page and compares. A mismatch names the node that differs.

If the server shows one thing and commits to another, the digests diverge. If the server commits to a deceptive page and later claims a compliant one, its own earlier signed commitment contradicts it.

## 2. Why we are doing it

- **A real gap.** Session-replay tools, screenshot-and-timestamp services and e-signature trails all produce evidence from *one* party. We surveyed them: that is the common weakness.
- **Dark patterns are mostly invisible to simple checks.** A shrunken reject button, grey-on-grey text, an overlay over "Reject" and a pre-ticked box all leave the text and accessibility tree unchanged. Our digest includes bucketed size, weight, contrast, prominence, visibility and occlusion so these change it.
- **It maps onto the course.** Sessions and cookies, encryption at rest, validation (required, range, compare-field), email OTP, logging, testing, and an original UI are all part of a working system rather than bolted on.
- **It is a research question we can measure.** Does the digest stay the same across browsers and devices, and does it change when someone manipulates the page? We are measuring that rather than asserting it.

## 3. Progress: what exists and works today

| Area | Status | Evidence |
|---|---|---|
| Accounts: register, email OTP, login, sessions, password reset | Done | server tests, live demo |
| Security: Argon2id, encrypted personal data with blind index, hardened cookies, CSRF, throttling, authorisation | Done | tests, including real HTTP checks |
| Sealed bundle, RFC 8785 canonical JSON, Ed25519 commitments with key rotation | Done | 100 builds give one hash; RFC test vectors |
| Single-use, session-bound nonces | Done | race test: 3 simultaneous submissions, exactly one wins |
| Attestor Module (semantic digest) | Done | 234 tests in a real browser |
| Same digest across Chromium, Chrome, Edge and Firefox | **30 of 30 cells agree** on a small sample | after one bug the comparison found and we fixed |
| Client signing with a non-extractable key | Done | key export provably fails |
| Server validation (11 distinct rejection codes) | Done | forged, replayed, wrong-key and expired attestations are refused |
| Append-only Merkle log, signed tree heads | Done | checked against an independent reference; the database itself refuses UPDATE/DELETE |
| Evidence pack and independent verifier | **Not started** (Phase 5) | |
| 200-page stability study and 20-mutation sensitivity study | **Not started** (Phase 6) | |
| Final UI polish, accessibility pass, report | **Not started** (Phase 7) | |

Numbers: **415 server tests, 146 client tests, 234 attestor tests**, plus a 20-check end-to-end run in a real browser. About 50 commits across 5 completed phases (playbook phases 0-4 of 7).

A finding worth mentioning: our first cross-browser run disagreed on one node. Chromium greys a disabled button's text by default and Firefox does not. That is browser styling rather than author intent, so we stopped measuring contrast on disabled controls and all four browsers then agreed. This is exactly the kind of result the stability study exists to find.

## 4. Honest limits (say these before you are asked)

- The **verifier is not built**, so the headline verdict ("the server showed X but committed to Y") is not yet demonstrable end to end. What we can show is each half of the evidence and why it cannot be forged.
- The digest proves **semantic fidelity, not visual fidelity**. A colour-scheme change is deliberately not detected.
- Cross-browser agreement is **30 cells on one operating system**. Safari and other platforms are unmeasured. Thresholds are provisional until the mutation suite is fixed.
- The attestor is served from a **separate origin, not independently run infrastructure**.
- **Tree-head publication** to an external witness is built and tested against a local git repository, but no real witness repository exists yet.
- Not done: the WebAuthn tier, CI runs on GitHub, a second-machine reproducibility check, real email delivery.
- A server that simply refuses to load the attestor produces no evidence. We treat that as a failed consent by policy; it cannot be prevented technically.

## 5. Open question for faculty

Syllabus units III and IV (open item O-01): must they be demonstrated? If so, the verifier moves from Node.js to Spring Boot. This decision is needed before Phase 5 starts.

## 6. What happens next

Phase 5 (evidence pack and the independent verifier with twelve verdicts and node-level diff), Phase 6 (stability and sensitivity measurements), Phase 7 (product polish, accessibility, report, demonstration).

## 7. How to present it (suggested 12 minutes)

1. **2 min** The problem and the idea (section 1) with the three-step diagram on a slide.
2. **6 min** Live demo (see `DEMO.md`): register and verify by OTP, open the consent page, show the technical evidence panel, then run the "attacks".
3. **2 min** The numbers and the cross-browser finding (section 3).
4. **2 min** Limits and the open question (sections 4 and 5). Raising these yourself reads as rigour.

Likely questions and the short answers are in the last section of `DEMO.md`.
