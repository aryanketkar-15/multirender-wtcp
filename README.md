# MRA — Mutual Render Attestation (PS-3)

Two-sided render attestation over a semantic layout digest. The server commits to a sealed render
bundle before interaction; the client attests to a normalised semantic digest at the moment of
interaction; an independent verifier re-renders the committed bundle and compares.

Group TY-A9, Department of Computer Engineering, Vishwakarma Institute of Technology, Pune.

## Modules

| Module | Role | Stack |
|---|---|---|
| [`client/`](client/README.md) | Consent UI, account UI, verifier dashboard | React, TypeScript, Vite |
| [`attestor/`](attestor/README.md) | Independent digest module (decision D-03) | TypeScript, no React |
| [`server/`](server/README.md) | Accounts, sealed bundles, commitments | PHP 8.2, MySQL |
| [`verifier/`](verifier/README.md) | Independent re-render and verdict | Node.js, Playwright |

## Documents

- Design document: *PS-3 Mutual Render Attestation — Proposed Solution* (kept outside the repo)
- [`PROJECT_LOG.md`](PROJECT_LOG.md) — decision rationale and checklists
- [`ASSETS.md`](ASSETS.md) — every visual asset and its provenance

## Quick start

```bash
(cd client   && npm install && npm run build)
(cd attestor && npm install && npm run build)
(cd verifier && npm install && npm run build)
(cd server   && composer install)
```

See each module's README for run and test commands. CI (`.github/workflows/ci.yml`) runs lint and
test for all four modules.

## Branching

`main` is protected. One branch per milestone, `feat/<milestone-id>-<slug>`, merged by pull request
reviewed by the other developer.
