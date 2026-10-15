import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page, LaunchOptions } from 'playwright';
import { Verdict } from './verdicts';
import type { DiffResult, UnpackedPack, VerificationResult } from './verdicts';
import { diffRepresentations } from './diff';
import type { SrdNodeLike } from './diff';

export interface RenderOptions {
  /**
   * Run headed under Xvfb (default: true).
   * In container / CI with Xvfb, headed is headless: false.
   */
  headed?: boolean;
  /**
   * Optional custom path to the Attestor Module bundle (mra-attestor-<version>.js).
   */
  attestorScriptPath?: string;
  /**
   * Optional pre-launched browser instance.
   */
  browser?: Browser;
  /**
   * Attested representation if known out-of-band for detailed diffing.
   */
  attestedRepresentation?: { nodes: SrdNodeLike[] };
  /**
   * Also require the context digest to match. Off by default: the context digest covers the whole
   * page the user saw, including the application shell, which is not part of the sealed bundle, so a
   * bundle-only replay cannot reproduce it (open item O-08). Turn on only when replaying a page that
   * includes the same shell.
   */
  compareContext?: boolean;
}

/**
 * Launch Playwright Chromium:
 * Headed under Xvfb by default (headless: false).
 * Falls back gracefully to system Chrome or Edge if ms-playwright cache is not pre-downloaded.
 */
export async function launchPlaywrightBrowser(options: LaunchOptions = {}): Promise<Browser> {
  const isHeaded =
    options.headless === false ||
    (options.headless === undefined && process.env.HEADLESS !== 'true');
  const launchOpts: LaunchOptions = {
    headless: !isHeaded,
    ...options,
  };

  try {
    if (fs.existsSync(chromium.executablePath())) {
      return await chromium.launch(launchOpts);
    }
  } catch {
    // Fall back to system channels
  }

  try {
    return await chromium.launch({ ...launchOpts, channel: 'chrome' });
  } catch {
    return await chromium.launch({ ...launchOpts, channel: 'msedge' });
  }
}

/**
 * Finds the Attestor Module build the pack names (by the SHA-256 of its bytes, which is the
 * attestor_hash the server committed to) among the builds available to this verifier. When none
 * matches, the newest available build is used and the result says so: a replay with a different
 * module is a weaker statement than a replay with the attested one.
 */
export function resolveAttestor(
  customPath: string | undefined,
  attestedHash: string,
): { code: string; hash: string; exact: boolean } {
  const hashOf = (code: string) =>
    'sha256:' + crypto.createHash('sha256').update(code).digest('hex');
  if (customPath && fs.existsSync(customPath)) {
    const code = fs.readFileSync(customPath, 'utf8');
    return { code, hash: hashOf(code), exact: hashOf(code) === attestedHash };
  }
  const dirs = [
    path.join(__dirname, '../../attestor/dist'),
    path.join(__dirname, '../attestor/dist'),
    path.join(process.cwd(), '../attestor/dist'),
    path.join(process.cwd(), 'attestor/dist'),
  ].filter((d) => fs.existsSync(d));
  const found: Array<{ code: string; hash: string; file: string }> = [];
  for (const d of dirs) {
    for (const file of fs.readdirSync(d).filter((f) => /^mra-attestor-.*[.]js$/.test(f))) {
      const code = fs.readFileSync(path.join(d, file), 'utf8');
      found.push({ code, hash: hashOf(code), file });
    }
    if (found.length) break;
  }
  if (!found.length) {
    throw new Error('Could not locate an Attestor Module build (mra-attestor-<version>.js)');
  }
  const exact = found.find((f) => f.hash === attestedHash);
  if (exact) return { code: exact.code, hash: exact.hash, exact: true };
  found.sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true }));
  const newest = found[found.length - 1];
  return { code: newest.code, hash: newest.hash, exact: false };
}

/**
 * Perform Stage 11: Headless / Xvfb-headed Playwright re-render and semantic digest comparison.
 */
export async function renderAndVerify(
  pack: UnpackedPack,
  options: RenderOptions = {},
): Promise<VerificationResult> {
  const bundle = pack.bundle as {
    markup?: string;
    css?: string;
    critical_region?: string;
    region_policy?: string;
  };

  if (!bundle || typeof bundle.markup !== 'string') {
    return {
      ok: false,
      verdict: Verdict.RENDER_FAILED,
      passedStages: 10,
      failedStage: 11,
      stages: [
        {
          stage: 11,
          name: 'Semantic Re-Render',
          ok: false,
          message: 'Malformed bundle: missing or invalid markup.',
        },
      ],
      message: 'Render failed: Bundle markup is missing or malformed.',
    };
  }

  const env = (pack.attestation.record.env ?? {}) as {
    engine?: string;
    viewport_bucket?: string;
    dpr_bucket?: string;
    forced_colors?: boolean;
    reduced_motion?: boolean;
  };

  // Map viewport bucket
  const vpBucket = String(env.viewport_bucket ?? 'medium').toLowerCase();
  const viewport =
    vpBucket === 'small' || vpBucket === 'narrow'
      ? { width: 375, height: 667 }
      : vpBucket === 'large'
        ? { width: 1280, height: 800 }
        : { width: 800, height: 600 }; // medium

  // Map device pixel ratio
  const dprBucket = String(env.dpr_bucket ?? '1x').toLowerCase();
  const deviceScaleFactor = dprBucket === '2x' ? 2 : dprBucket === '3x' ? 3 : 1;

  let browser = options.browser;
  let ownBrowser = false;

  if (!browser) {
    browser = await launchPlaywrightBrowser({
      headless: options.headed === false ? true : undefined,
    });
    ownBrowser = true;
  }

  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    context = await browser.newContext({
      viewport,
      deviceScaleFactor,
      forcedColors: env.forced_colors ? 'active' : 'none',
      reducedMotion: env.reduced_motion ? 'reduce' : 'no-preference',
    });

    page = await context.newPage();

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${bundle.css ?? ''}
  </style>
</head>
<body>
  ${bundle.markup}
</body>
</html>`;
    await page.route('http://localhost/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: htmlContent,
      });
    });
    const attestor = resolveAttestor(
      options.attestorScriptPath,
      String(pack.attestation.record.attestor_hash ?? ''),
    );
    const attestorCode = attestor.code;
    const attestedCriticalRegionDigest = String(
      pack.attestation.record.critical_region_digest ?? '',
    );

    /**
     * The user attested the page as it was just before the click, so the replay must put the form in
     * a state the interface allows at that moment: Accept is only enabled with the consent box
     * ticked; Reject can be clicked with the box ticked or not. Candidate states are tried in turn.
     */
    const action = String(pack.attestation.record.action ?? '');
    const candidates: Array<'ticked' | 'pristine'> =
      action === 'accept'
        ? ['ticked']
        : action === 'reject'
          ? ['pristine', 'ticked']
          : ['pristine', 'ticked'];

    const measureState = async (state: 'ticked' | 'pristine') => {
      const p = page as Page;
      await p.goto('http://localhost/', { waitUntil: 'load' });
      await p.addScriptTag({ content: attestorCode });
      return p.evaluate(
        async (opts) => {
          const win = window as unknown as {
            MRAttestor?: {
              measure: (
                doc: Document,
                options: { regionSelector: string; regionPolicy: string },
              ) => { region: { nodes: SrdNodeLike[] }; context: { nodes: SrdNodeLike[] } };
              digestOf: (rep: unknown) => Promise<{ digest: string }>;
            };
          };
          const attestor = win.MRAttestor;
          if (!attestor) {
            throw new Error('MRAttestor global not found in page');
          }
          if (opts.state === 'ticked') {
            const box = document.querySelector<HTMLInputElement>('#agree');
            const accept = document.querySelector<HTMLButtonElement>('#btn-agree');
            if (box) box.checked = true;
            if (accept) accept.disabled = false;
          }

          const reps = attestor.measure(document, {
            regionSelector: opts.regionSelector,
            regionPolicy: opts.regionPolicy || 'consent/v1',
          });

          const regionDigestRes = await attestor.digestOf(reps.region);
          const contextDigestRes = await attestor.digestOf(reps.context);

          return {
            critical_region_digest: regionDigestRes.digest,
            context_digest: contextDigestRes.digest,
            regionRepresentation: reps.region,
            contextRepresentation: reps.context,
          };
        },
        {
          state,
          regionSelector: bundle.critical_region ?? '#consent-dialog',
          regionPolicy: bundle.region_policy ?? 'consent/v1',
        },
      );
    };

    let recomputed = await measureState(candidates[0]);
    for (const state of candidates) {
      if (state !== candidates[0]) recomputed = await measureState(state);
      if (
        recomputed.critical_region_digest.toLowerCase() ===
        attestedCriticalRegionDigest.toLowerCase()
      ) {
        break;
      }
    }

    const attestedContextDigest = String(pack.attestation.record.context_digest ?? '');

    // Extract attested representation if available in pack (or from options)
    const rawAttestedRep =
      options.attestedRepresentation ??
      (pack.fileBuffers['representation.json']
        ? JSON.parse(pack.fileBuffers['representation.json'].toString('utf8'))
        : (pack.attestation.record.representation as { nodes: SrdNodeLike[] } | undefined));

    // Check critical region digest match
    if (
      recomputed.critical_region_digest.toLowerCase() !== attestedCriticalRegionDigest.toLowerCase()
    ) {
      let diff: DiffResult | undefined;
      if (rawAttestedRep) {
        diff = diffRepresentations(rawAttestedRep, recomputed.regionRepresentation);
      } else {
        // Synthesize single node difference for reporting if baseline representation was omitted
        diff = {
          hasMismatch: true,
          totalAttestedNodes: 0,
          totalRecomputedNodes: recomputed.regionRepresentation.nodes.length,
          mismatchedNodes: [
            {
              index: 0,
              role: recomputed.regionRepresentation.nodes[0]?.role ?? 'unknown',
              name: recomputed.regionRepresentation.nodes[0]?.name,
              text: recomputed.regionRepresentation.nodes[0]?.text,
              differences: {
                critical_region_digest: {
                  attested: attestedCriticalRegionDigest,
                  recomputed: recomputed.critical_region_digest,
                },
              },
              summary: `Digest mismatch: expected ${attestedCriticalRegionDigest}, recomputed ${recomputed.critical_region_digest}`,
            },
          ],
          summary: `Digest mismatch: expected ${attestedCriticalRegionDigest}, recomputed ${recomputed.critical_region_digest}`,
        };
      }

      return {
        ok: false,
        verdict: Verdict.DIGEST_MISMATCH,
        passedStages: 10,
        failedStage: 11,
        stages: [
          {
            stage: 11,
            name: 'Semantic Re-Render',
            ok: false,
            message: `Semantic digest mismatch: ${diff.summary}`,
            details: { diff, recomputedDigests: recomputed },
          },
        ],
        diff,
        recomputedDigests: {
          critical_region_digest: recomputed.critical_region_digest,
          context_digest: recomputed.context_digest,
        },
        message: `Semantic digest mismatch on critical region: ${diff.summary}`,
      };
    }

    // Check context digest match (catches overlays or deceptive injected chrome outside critical region)
    if (
      options.compareContext &&
      attestedContextDigest &&
      recomputed.context_digest.toLowerCase() !== attestedContextDigest.toLowerCase()
    ) {
      const diff = diffRepresentations(rawAttestedRep ?? [], recomputed.contextRepresentation);

      return {
        ok: false,
        verdict: Verdict.CONTEXT_MISMATCH,
        passedStages: 10,
        failedStage: 11,
        stages: [
          {
            stage: 11,
            name: 'Semantic Re-Render',
            ok: false,
            message:
              'Context digest mismatch: foreign content or overlay detected outside critical region.',
            details: { diff, recomputedDigests: recomputed },
          },
        ],
        diff,
        recomputedDigests: {
          critical_region_digest: recomputed.critical_region_digest,
          context_digest: recomputed.context_digest,
        },
        message:
          'Context digest mismatch: deceptive content detected outside declared critical region.',
      };
    }

    // Both digests match!
    return {
      ok: true,
      verdict: Verdict.VERIFIED,
      passedStages: 11,
      stages: [
        {
          stage: 11,
          name: 'Semantic Re-Render',
          ok: true,
          message: options.compareContext
            ? 'Recomputed region digest and context digest match the client attestation exactly.'
            : 'Recomputed critical-region digest matches the client attestation exactly. The context digest was not compared.',
          details: {
            critical_region_digest: recomputed.critical_region_digest,
            context_digest: recomputed.context_digest,
            replay_attestor_hash: attestor.hash,
            replay_attestor_is_the_attested_build: attestor.exact,
            context_compared: options.compareContext === true,
          },
        },
      ],
      recomputedDigests: {
        critical_region_digest: recomputed.critical_region_digest,
        context_digest: recomputed.context_digest,
      },
      message: 'All 11 verification stages passed: Evidence pack is mutually verified.',
    };
  } catch (err) {
    return {
      ok: false,
      verdict: Verdict.RENDER_FAILED,
      passedStages: 10,
      failedStage: 11,
      stages: [
        {
          stage: 11,
          name: 'Semantic Re-Render',
          ok: false,
          message: `Render failure: ${(err as Error).message}`,
        },
      ],
      message: `Render failed: ${(err as Error).message}`,
    };
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (ownBrowser && browser) await browser.close().catch(() => {});
  }
}
