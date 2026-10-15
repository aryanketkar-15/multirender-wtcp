# Releasing the Attestor Module

The Attestor Module computes the semantic digest the client signs. It is deliberately **not** part
of the consent server or the React bundle (decision D-03): if the party whose honesty is being
tested also served the code that measures the page, the client signature would attest to nothing.
This document is written so the other developer can release unaided.

## What a release is

| Artefact | Where | Purpose |
|---|---|---|
| `attestor/dist/mra-attestor-<version>.js` | independent static host | the module, one file, worker embedded |
| `attestor/dist/manifest.json` | repository (tagged commit only) | `sha384` for SRI, `sha256` for `attestor_hash` |
| `attestor_registry` row | server database | which hashes the system recognises, and their status |
| git tag `attestor-v<version>` | repository | makes the published hash reproducible from source |

`dist/` is git-ignored except on a tagged release commit, where it is added with `git add -f`.

## Prerequisites

- Node 22 and `npm ci` clean. The toolchain is pinned: `esbuild` is an exact version in
  `package.json`, and `package-lock.json` is committed. Do not use a different Node major without
  re-checking the hash on both machines.
- Chromium for the browser tests: `npx playwright install chromium`.
- A static host on an origin different from the API.

## Procedure

1. Bump `version` in `attestor/package.json` (semver). Any change to normalisation, thresholds or
   the representation is a **new version**: historical attestations must keep verifying against the
   version that produced them.
2. Commit the source change on a branch and merge it by pull request.
3. From the repository root on `main`:

   ```bash
   attestor/scripts/release.sh
   ```

   It refuses to run on a dirty tree, runs lint and tests, builds **twice** from scratch, and
   fails unless both builds have the same hash. It prints the file, the `attestor_hash` and the
   integrity value.
4. The **second developer** repeats step 3 on their own machine and compares the printed
   `attestor_hash`. Do not publish until both match. (Playbook T3.5.1.)
5. Commit the release artefacts and tag:

   ```bash
   git add -f attestor/dist/mra-attestor-<version>.js attestor/dist/manifest.json
   git commit -m "release(attestor): v<version>"
   git tag attestor-v<version>
   ```
6. Publish the single `.js` file to the attestor host, keeping the file name. For local
   development: `npm run serve --prefix attestor` serves `attestor/dist` on `http://127.0.0.1:8090`
   with the CORS headers that cross-origin SRI needs.
7. Register it on the server:

   ```bash
   php server/bin/register_attestor.php attestor/dist/manifest.json
   ```

   Set `ATTESTOR_BASE_URL` in `server/.env` to the host's base URL. From then on every commitment
   names this `attestor_hash` and version, and `GET /api/bundle` tells the browser which file and
   integrity value to load.

## Keeping earlier versions

`release.sh` rebuilds `dist/` from scratch, which deletes earlier releases. Evidence packs name the
exact build that produced them, and a verifier replays a pack with that build, so every released
file must stay available:

```bash
git checkout -- attestor/dist/mra-attestor-<earlier-version>.js
git show attestor-v<earlier-version>:attestor/dist/manifest.json > attestor/dist/manifest-<earlier-version>.json
git add -f attestor/dist/manifest-<earlier-version>.json
```

`dist/manifest.json` always describes the newest release. The release-artefact test compares a
fresh build with it only when the two have the same version.

## Rollback

Never delete a registry row: evidence packs that reference a version must stay verifiable.

```bash
php server/bin/register_attestor.php --deprecate sha256:<hash>
```

then register and activate the previous version again and redeploy its tag.

## Failure behaviour (by design)

If the module cannot be fetched, fails its integrity check, reports a different version, or hashes
to something other than the commitment names, the consent page shows an error and offers **no
action**. There is no fallback to code served by the consent server. A fully adversarial server can
still decline to load the module at all, which yields no evidence; that is a policy consequence
(absence of an attestation is a failed consent), not something this mechanism can prevent.

## Hosting honesty

A genuinely independent host means different infrastructure and a different operator. For the
prototype, the attestor is served from a separate **origin** (another port on the development
machine, or a different subdomain), which gives the browser's same-origin and SRI guarantees but
**not** independent administration. State this plainly in the report; do not claim more.
