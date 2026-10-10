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
 * Locate and read the independently hosted Attestor Module bundle.
 */
export function resolveAttestorScript(customPath?: string): string {
  if (customPath && fs.existsSync(customPath)) {
    return fs.readFileSync(customPath, 'utf8');
  }

  const candidatePaths = [
    path.join(__dirname, '../../attestor/dist/mra-attestor-1.0.0.js'),
    path.join(__dirname, '../attestor/dist/mra-attestor-1.0.0.js'),
    path.join(process.cwd(), '../attestor/dist/mra-attestor-1.0.0.js'),
    path.join(process.cwd(), 'attestor/dist/mra-attestor-1.0.0.js'),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8');
    }
  }

  throw new Error('Could not locate Attestor Module bundle (mra-attestor-1.0.0.js)');
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
    await page.goto('http://localhost/', { waitUntil: 'load' });

    // Load and inject the Attestor Module
    const attestorCode = resolveAttestorScript(options.attestorScriptPath);
    await page.addScriptTag({ content: attestorCode });

    // Evaluate measurement inside the page context
    const recomputed = await page.evaluate(
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
        regionSelector: bundle.critical_region ?? '#consent-dialog',
        regionPolicy: bundle.region_policy ?? 'consent/v1',
      },
    );

    const attestedCriticalRegionDigest = String(
      pack.attestation.record.critical_region_digest ?? '',
    );
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
          message:
            'Recomputed semantic digest and context digest match client attestation exactly.',
          details: {
            critical_region_digest: recomputed.critical_region_digest,
            context_digest: recomputed.context_digest,
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
