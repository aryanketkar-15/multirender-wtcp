import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { launchPlaywrightBrowser, renderAndVerify } from '../src/render';
import type { Browser, Route } from 'playwright';
import { Verdict } from '../src/verdicts';
import { unpackPack } from '../src/checks/unpack';
import { canonicalJson } from '../src/checks/jcs';
import { computeLeafHash, nodeHash } from '../src/checks/merkle';
import { publicKeyFingerprint, sha256Prefixed } from '../src/checks/crypto';
import { diffRepresentations } from '../src/diff';

describe('Milestone 5.3 — Headless / Xvfb-headed Re-render and Digest Comparison', () => {
  let browser: Browser;
  let serverPair: crypto.KeyPairKeyObjectResult;
  let clientPair: crypto.KeyPairKeyObjectResult;
  let clientPubkeyPem: string;
  let clientPubkeyFpr: string;

  // Real honest bundle and honest pack zip
  let honestPackZip: Buffer;
  let attestedCriticalRegionDigest: string;
  let attestedContextDigest: string;
  let attestedRegionRep: unknown;

  beforeAll(async () => {
    browser = await launchPlaywrightBrowser({ headless: process.env.HEADLESS === 'true' });

    // Keypairs
    serverPair = crypto.generateKeyPairSync('ed25519');

    clientPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    clientPubkeyPem = clientPair.publicKey.export({ format: 'pem', type: 'spki' }).toString();
    clientPubkeyFpr = publicKeyFingerprint(clientPubkeyPem)!;

    // Measure initial honest bundle in Playwright to obtain ground-truth digests
    const bundleMarkup = `
      <div id="consent-dialog">
        <p>We request your consent to process analytics data according to our privacy policy.</p>
        <button id="btn-agree">I Agree</button>
        <button id="btn-reject">Reject</button>
      </div>
    `;
    const bundleCss = `
      #consent-dialog { margin: 20px; font-family: sans-serif; }
      #btn-agree { font-size: 14px; padding: 8px 16px; background-color: #0055ff; color: #ffffff; }
      #btn-reject { font-size: 14px; padding: 8px 16px; background-color: #eeeeee; color: #111111; }
    `;

    const context = await browser.newContext({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.route('http://localhost/**', (route: Route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!DOCTYPE html><html><head><style>${bundleCss}</style></head><body>${bundleMarkup}</body></html>`,
      });
    });
    await page.goto('http://localhost/', { waitUntil: 'load' });

    const attestorScriptPath = path.join(__dirname, '../../attestor/dist/mra-attestor-1.0.0.js');
    await page.addScriptTag({ path: attestorScriptPath });

    const measured = await page.evaluate(async () => {
      const a = (
        window as unknown as {
          MRAttestor: {
            measure: (
              doc: Document,
              opts: { regionSelector: string; regionPolicy: string },
            ) => { region: unknown; context: unknown };
            digestOf: (r: unknown) => Promise<{ digest: string }>;
          };
        }
      ).MRAttestor;
      const reps = a.measure(document, {
        regionSelector: '#consent-dialog',
        regionPolicy: 'consent/v1',
      });
      const rDig = await a.digestOf(reps.region);
      const cDig = await a.digestOf(reps.context);
      return {
        regionDigest: rDig.digest,
        contextDigest: cDig.digest,
        regionRep: reps.region,
        contextRep: reps.context,
      };
    });

    attestedCriticalRegionDigest = measured.regionDigest;
    attestedContextDigest = measured.contextDigest;
    attestedRegionRep = measured.regionRep;

    await context.close();

    // Build the ground-truth honest evidence pack
    honestPackZip = createPackZip({
      markup: bundleMarkup,
      css: bundleCss,
      critical_region: '#consent-dialog',
      region_policy: 'consent/v1',
      critical_region_digest: attestedCriticalRegionDigest,
      context_digest: attestedContextDigest,
      representation: attestedRegionRep,
      env: {
        engine: 'Blink',
        engine_major: 130,
        viewport_bucket: 'medium',
        dpr_bucket: '1x',
        forced_colors: false,
        reduced_motion: false,
      },
    });
  }, 45_000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  function createPackZip(params: {
    markup: string;
    css: string;
    critical_region: string;
    region_policy: string;
    critical_region_digest: string;
    context_digest: string;
    representation?: unknown;
    env?: Record<string, unknown>;
    action?: string;
    action_target?: string;
  }): Buffer {
    const bundle = {
      bundle_id: 'b1',
      version: '1.0',
      region_policy: params.region_policy,
      critical_region: params.critical_region,
      markup: params.markup,
      css: params.css,
    };
    const bundleHash = sha256Prefixed(canonicalJson(bundle));

    const commitmentRecord = {
      v: 'mra/1.0',
      type: 'commitment',
      bundle_id: 'b1',
      bundle_hash: bundleHash,
      client_pubkey_fpr: clientPubkeyFpr,
      nonce: 'd8e8fca2dc0f896fd7cb4cb0031ba249',
      ts: '2026-10-10T13:00:00Z',
      valid_until: '2026-10-10T14:00:00Z',
      key_id: 'k1',
      log_leaf_index: 0,
    };
    const commitmentSig = crypto
      .sign(null, Buffer.from(canonicalJson(commitmentRecord), 'utf8'), serverPair.privateKey)
      .toString('base64url');
    const commitmentHash = sha256Prefixed(canonicalJson(commitmentRecord));

    const attestationRecord: Record<string, unknown> = {
      v: 'mra/1.0',
      commitment_hash: commitmentHash,
      critical_region_digest: params.critical_region_digest,
      context_digest: params.context_digest,
      action: params.action ?? 'accept',
      action_target: params.action_target ?? '#btn-agree',
      env: params.env ?? {
        engine: 'Blink',
        engine_major: 130,
        viewport_bucket: 'medium',
        dpr_bucket: '1x',
        forced_colors: false,
        reduced_motion: false,
      },
      attestor_hash: 'sha256:f805f3642219c751e5e76699bb096aeb63ce5946e20a32748121bebb3cb2949a',
      nonce: 'd8e8fca2dc0f896fd7cb4cb0031ba249',
      client_ts: '2026-10-10T13:05:00Z',
      client_pubkey: clientPubkeyPem,
    };
    if (params.representation) {
      attestationRecord.representation = params.representation;
    }

    const attestationSig = crypto
      .sign('sha256', Buffer.from(canonicalJson(attestationRecord), 'utf8'), {
        key: clientPair.privateKey,
        dsaEncoding: 'ieee-p1363',
      })
      .toString('base64url');
    const attestationHash = sha256Prefixed(canonicalJson(attestationRecord));

    const commitmentLeafRecord = {
      v: 'mra/1.0',
      kind: 'commitment',
      ref_hash: commitmentHash,
      commitment: commitmentRecord,
      signature: commitmentSig,
    };
    const commitmentLeafHash = computeLeafHash(canonicalJson(commitmentLeafRecord));

    const attestationLeafRecord = {
      v: 'mra/1.0',
      kind: 'attestation',
      ref_hash: attestationHash,
      record: attestationRecord,
      signature: attestationSig,
    };
    const attestationLeafHash = computeLeafHash(canonicalJson(attestationLeafRecord));

    const rootBuf = nodeHash(
      Buffer.from(commitmentLeafHash, 'hex'),
      Buffer.from(attestationLeafHash, 'hex'),
    );
    const rootHashPrefixed = `sha256:${rootBuf.toString('hex')}`;

    const sthRecord = {
      v: 'mra/1.0',
      type: 'signed_tree_head',
      tree_size: 2,
      root_hash: rootHashPrefixed,
      timestamp: '2026-10-10T13:06:00Z',
      key_id: 'k1',
    };
    const sthSig = crypto
      .sign(null, Buffer.from(canonicalJson(sthRecord), 'utf8'), serverPair.privateKey)
      .toString('base64url');

    const manifest = {
      schema_version: '1.0',
      pack_id: 'pack_test_5_3',
      created_at: '2026-10-10T13:06:00Z',
      server_key_id: 'k1',
      client_pubkey_fpr: clientPubkeyFpr,
      hashes: {
        bundle_hash: bundleHash,
        commitment_hash: commitmentHash,
        attestation_hash: attestationHash,
        client_pubkey_fpr: clientPubkeyFpr,
      },
      tree: {
        tree_size: 2,
        root_hash: rootHashPrefixed,
        commitment_leaf_index: 0,
        attestation_leaf_index: 1,
      },
      components: {
        bundle: 'bundle.json',
        commitment: 'commitment.json',
        attestation: 'attestation.json',
        client_pubkey: 'client_pubkey.pem',
        inclusion_proof_commitment: 'inclusion_proof_commitment.json',
        inclusion_proof_attestation: 'inclusion_proof_attestation.json',
        signed_tree_head: 'signed_tree_head.json',
      },
    };

    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    zip.addFile('bundle.json', Buffer.from(JSON.stringify(bundle, null, 2), 'utf8'));
    zip.addFile(
      'commitment.json',
      Buffer.from(
        JSON.stringify(
          {
            record: commitmentRecord,
            signature: commitmentSig,
            commitment_hash: commitmentHash,
            key_id: 'k1',
          },
          null,
          2,
        ),
        'utf8',
      ),
    );
    zip.addFile(
      'attestation.json',
      Buffer.from(
        JSON.stringify(
          {
            record: attestationRecord,
            signature: attestationSig,
            attestation_hash: attestationHash,
          },
          null,
          2,
        ),
        'utf8',
      ),
    );
    zip.addFile('client_pubkey.pem', Buffer.from(clientPubkeyPem, 'utf8'));
    zip.addFile(
      'inclusion_proof_commitment.json',
      Buffer.from(
        JSON.stringify(
          {
            leaf_index: 0,
            tree_size: 2,
            leaf_hash: commitmentLeafHash,
            path: [attestationLeafHash],
            leaf_record: commitmentLeafRecord,
          },
          null,
          2,
        ),
        'utf8',
      ),
    );
    zip.addFile(
      'inclusion_proof_attestation.json',
      Buffer.from(
        JSON.stringify(
          {
            leaf_index: 1,
            tree_size: 2,
            leaf_hash: attestationLeafHash,
            path: [commitmentLeafHash],
            leaf_record: attestationLeafRecord,
          },
          null,
          2,
        ),
        'utf8',
      ),
    );
    zip.addFile(
      'signed_tree_head.json',
      Buffer.from(JSON.stringify({ record: sthRecord, signature: sthSig }, null, 2), 'utf8'),
    );

    if (params.representation) {
      zip.addFile(
        'representation.json',
        Buffer.from(JSON.stringify(params.representation, null, 2), 'utf8'),
      );
    }

    return zip.toBuffer();
  }

  // -------------------------------------------------------------
  // T5.3.1: Honest pack verifies
  // -------------------------------------------------------------
  test('T5.3.1: Honest pack re-renders and verifies with matching digests', async () => {
    const unpacked = unpackPack(honestPackZip);
    const result = await renderAndVerify(unpacked, { browser });

    expect(result.ok).toBe(true);
    expect(result.verdict).toBe(Verdict.VERIFIED);
    expect(result.passedStages).toBe(11);
    expect(result.recomputedDigests?.critical_region_digest).toBe(attestedCriticalRegionDigest);
    expect(result.recomputedDigests?.context_digest).toBe(attestedContextDigest);
  }, 15_000);

  // -------------------------------------------------------------
  // T5.3.2: Text change detected (Server altered disclosure text)
  // -------------------------------------------------------------
  test('T5.3.2: Altered disclosure text is detected and diverging node is named', async () => {
    const alteredZip = createPackZip({
      markup: `
        <div id="consent-dialog">
          <p>We request your consent to sell your biometric and location data to third parties.</p>
          <button id="btn-agree">I Agree</button>
          <button id="btn-reject">Reject</button>
        </div>
      `,
      css: '#consent-dialog { margin: 20px; }',
      critical_region: '#consent-dialog',
      region_policy: 'consent/v1',
      critical_region_digest: attestedCriticalRegionDigest, // original honest digest
      context_digest: attestedContextDigest,
      representation: attestedRegionRep,
    });

    const unpacked = unpackPack(alteredZip);
    const result = await renderAndVerify(unpacked, { browser });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe(Verdict.DIGEST_MISMATCH);
    expect(result.diff).toBeDefined();
    expect(result.diff?.hasMismatch).toBe(true);

    const textDiffNode = result.diff?.mismatchedNodes.find((n) => n.role === 'paragraph');
    expect(textDiffNode).toBeDefined();
    expect(textDiffNode?.differences.text).toBeDefined();
  }, 15_000);

  // -------------------------------------------------------------
  // T5.3.3: Prominence change detected (Reject shrunk and greyed)
  // -------------------------------------------------------------
  test('T5.3.3: Shrunk and greyed reject button is detected with bucket changes shown', async () => {
    const darkenedZip = createPackZip({
      markup: `
        <div id="consent-dialog">
          <p>We request your consent to process analytics data according to our privacy policy.</p>
          <button id="btn-agree">I Agree</button>
          <button id="btn-reject">Reject</button>
        </div>
      `,
      // Dark pattern: reject button shrunk to 5px with low contrast #999 on #888
      css: `
        #consent-dialog { margin: 20px; }
        #btn-agree { font-size: 16px; padding: 12px 24px; background: #0055ff; color: #fff; }
        #btn-reject { font-size: 6px; width: 20px; height: 10px; color: #888888; background-color: #999999; }
      `,
      critical_region: '#consent-dialog',
      region_policy: 'consent/v1',
      critical_region_digest: attestedCriticalRegionDigest, // original honest digest
      context_digest: attestedContextDigest,
      representation: attestedRegionRep,
    });

    const unpacked = unpackPack(darkenedZip);
    const result = await renderAndVerify(unpacked, { browser });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe(Verdict.DIGEST_MISMATCH);
    expect(result.diff?.hasMismatch).toBe(true);

    const rejectNode = result.diff?.mismatchedNodes.find(
      (n) => n.name === 'reject' || n.name === 'Reject',
    );
    expect(rejectNode).toBeDefined();
    expect(
      rejectNode?.differences['style.prominence'] ||
        rejectNode?.differences['style.contrast'] ||
        rejectNode?.differences['style.size'],
    ).toBeDefined();
  }, 15_000);

  // -------------------------------------------------------------
  // T5.3.4: Pre-tick detected (Checkbox pre-ticked)
  // -------------------------------------------------------------
  test('T5.3.4: Pre-ticked checkbox is detected on the checkbox node', async () => {
    const honestWithCheckboxMarkup = `
      <div id="consent-dialog">
        <p>Choose your preferences:</p>
        <label><input type="checkbox" id="chk-opt"> Marketing communications</label>
        <button id="btn-agree">I Agree</button>
        <button id="btn-reject">Reject</button>
      </div>
    `;
    const honestContext = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const honestPage = await honestContext.newPage();
    await honestPage.route('http://localhost/**', (route: Route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!DOCTYPE html><html><body>${honestWithCheckboxMarkup}</body></html>`,
      });
    });
    await honestPage.goto('http://localhost/', { waitUntil: 'load' });
    const attestorScriptPath = path.join(__dirname, '../../attestor/dist/mra-attestor-1.0.0.js');
    await honestPage.addScriptTag({ path: attestorScriptPath });

    const honestCheckboxMeasured = await honestPage.evaluate(async () => {
      const a = (
        window as unknown as {
          MRAttestor: {
            measure: (
              doc: Document,
              opts: { regionSelector: string; regionPolicy: string },
            ) => { region: unknown; context: unknown };
            digestOf: (r: unknown) => Promise<{ digest: string }>;
          };
        }
      ).MRAttestor;
      const reps = a.measure(document, {
        regionSelector: '#consent-dialog',
        regionPolicy: 'consent/v1',
      });
      const dig = await a.digestOf(reps.region);
      const cdig = await a.digestOf(reps.context);
      return { rDig: dig.digest, cDig: cdig.digest, regionRep: reps.region };
    });
    await honestContext.close();

    // Now bundle is altered with `checked` attribute on the checkbox!
    const pretickedMarkup = `
      <div id="consent-dialog">
        <p>Choose your preferences:</p>
        <label><input type="checkbox" id="chk-opt" checked> Marketing communications</label>
        <button id="btn-agree">I Agree</button>
        <button id="btn-reject">Reject</button>
      </div>
    `;

    const pretickedZip = createPackZip({
      markup: pretickedMarkup,
      css: '#consent-dialog { margin: 20px; }',
      critical_region: '#consent-dialog',
      region_policy: 'consent/v1',
      critical_region_digest: honestCheckboxMeasured.rDig,
      context_digest: honestCheckboxMeasured.cDig,
      representation: honestCheckboxMeasured.regionRep,
    });

    const unpacked = unpackPack(pretickedZip);
    const result = await renderAndVerify(unpacked, { browser });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe(Verdict.DIGEST_MISMATCH);
    expect(result.diff?.hasMismatch).toBe(true);

    const checkboxDiff = result.diff?.mismatchedNodes.find((n) => n.role === 'checkbox');
    expect(checkboxDiff).toBeDefined();
    expect(checkboxDiff?.differences.checked).toBeDefined();
    expect(checkboxDiff?.differences.checked.attested).toBe(false);
    expect(checkboxDiff?.differences.checked.recomputed).toBe(true);
  }, 15_000);

  // -------------------------------------------------------------
  // T5.3.5: Context mismatch (Overlay outside the region)
  // -------------------------------------------------------------
  test('T5.3.5: Injected overlay outside critical region produces CONTEXT_MISMATCH', async () => {
    // Critical region is identical, but body contains deceptive overlay
    const contextAttackMarkup = `
      <div id="consent-dialog">
        <p>We request your consent to process analytics data according to our privacy policy.</p>
        <button id="btn-agree">I Agree</button>
        <button id="btn-reject">Reject</button>
      </div>
      <div id="deceptive-overlay">
        <h2>URGENT: Your account will be closed immediately unless you agree!</h2>
      </div>
    `;

    const contextAttackZip = createPackZip({
      markup: contextAttackMarkup,
      css: `
        #consent-dialog { margin: 20px; font-family: sans-serif; }
        #btn-agree { font-size: 14px; padding: 8px 16px; background-color: #0055ff; color: #ffffff; }
        #btn-reject { font-size: 14px; padding: 8px 16px; background-color: #eeeeee; color: #111111; }
        #deceptive-overlay { background: red; color: white; padding: 20px; }
      `,
      critical_region: '#consent-dialog',
      region_policy: 'consent/v1',
      critical_region_digest: attestedCriticalRegionDigest, // matches critical region
      context_digest: attestedContextDigest, // does not match context
      representation: attestedRegionRep,
    });

    const unpacked = unpackPack(contextAttackZip);
    const result = await renderAndVerify(unpacked, { browser, compareContext: true });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe(Verdict.CONTEXT_MISMATCH);
    expect(result.message).toContain('deceptive content detected');
  }, 15_000);

  // -------------------------------------------------------------
  // T5.3.6: Env profile applied (narrow / 2x)
  // -------------------------------------------------------------
  test('T5.3.6: Environment vector applies narrow viewport and 2x DPR', async () => {
    const customEnvZip = createPackZip({
      markup: `
        <div id="consent-dialog">
          <p>We request your consent to process analytics data according to our privacy policy.</p>
          <button id="btn-agree">I Agree</button>
          <button id="btn-reject">Reject</button>
        </div>
      `,
      css: '#consent-dialog { margin: 20px; }',
      critical_region: '#consent-dialog',
      region_policy: 'consent/v1',
      critical_region_digest:
        'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      context_digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      env: {
        engine: 'Blink',
        engine_major: 130,
        viewport_bucket: 'narrow',
        dpr_bucket: '2x',
        forced_colors: false,
        reduced_motion: true,
      },
    });

    const unpacked = unpackPack(customEnvZip);
    const result = await renderAndVerify(unpacked, { browser });

    // The render must complete without crashing, evaluating under narrow 2x settings
    expect(result.recomputedDigests).toBeDefined();
    expect(result.recomputedDigests?.critical_region_digest).toBeTruthy();
  }, 15_000);

  // -------------------------------------------------------------
  // T5.3.7: Render failure handled gracefully
  // -------------------------------------------------------------
  test('T5.3.7: Malformed bundle produces RENDER_FAILED without crashing', async () => {
    const malformedZip = createPackZip({
      markup: '<div>No matching critical region element here</div>',
      css: '',
      critical_region: '#non-existent-region',
      region_policy: 'consent/v1',
      critical_region_digest: attestedCriticalRegionDigest,
      context_digest: attestedContextDigest,
    });

    const unpacked = unpackPack(malformedZip);
    const result = await renderAndVerify(unpacked, { browser });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe(Verdict.RENDER_FAILED);
    expect(result.message).toContain('Render failed');
  }, 15_000);

  // -------------------------------------------------------------
  // T5.3.8: Diff names the node with index, role, and values
  // -------------------------------------------------------------
  test('T5.3.8: Semantic diff outputs node index, role, attested and recomputed values', () => {
    const attestedNodes = [
      { i: 0, role: 'paragraph', text: 'Original terms', visible: true, occlusion: 'clear' },
      {
        i: 1,
        role: 'button',
        name: 'Reject',
        visible: true,
        occlusion: 'clear',
        style: { prominence: 'equal', contrast: 'high' },
      },
    ];
    const recomputedNodes = [
      { i: 0, role: 'paragraph', text: 'Modified terms', visible: true, occlusion: 'clear' },
      {
        i: 1,
        role: 'button',
        name: 'Reject',
        visible: true,
        occlusion: 'clear',
        style: { prominence: 'suppressed', contrast: 'low' },
      },
    ];

    const diff = diffRepresentations({ nodes: attestedNodes }, { nodes: recomputedNodes });

    expect(diff.hasMismatch).toBe(true);
    expect(diff.mismatchedNodes.length).toBe(2);

    expect(diff.mismatchedNodes[0].index).toBe(0);
    expect(diff.mismatchedNodes[0].role).toBe('paragraph');
    expect(diff.mismatchedNodes[0].differences.text.attested).toBe('Original terms');
    expect(diff.mismatchedNodes[0].differences.text.recomputed).toBe('Modified terms');

    expect(diff.mismatchedNodes[1].index).toBe(1);
    expect(diff.mismatchedNodes[1].role).toBe('button');
    expect(diff.mismatchedNodes[1].differences['style.prominence'].attested).toBe('equal');
    expect(diff.mismatchedNodes[1].differences['style.prominence'].recomputed).toBe('suppressed');
  });

  // -------------------------------------------------------------
  // T5.3.9: Repeatable (Honest pack verified 20 consecutive times)
  // -------------------------------------------------------------
  test('T5.3.9: Honest pack verifies 20 consecutive times with identical VERIFIED verdict', async () => {
    const unpacked = unpackPack(honestPackZip);

    for (let run = 1; run <= 20; run++) {
      const result = await renderAndVerify(unpacked, { browser });
      expect(result.ok).toBe(true);
      expect(result.verdict).toBe(Verdict.VERIFIED);
      expect(result.recomputedDigests?.critical_region_digest).toBe(attestedCriticalRegionDigest);
    }
  }, 60_000);

  // -------------------------------------------------------------
  // T5.3.10: Container reproducible (Dockerfile pins browser & fonts)
  // -------------------------------------------------------------
  test('T5.3.10: Dockerfile pins base Playwright image, exact font packages, and Xvfb', () => {
    const dockerfilePath = path.join(__dirname, '../Dockerfile');
    expect(fs.existsSync(dockerfilePath)).toBe(true);

    const content = fs.readFileSync(dockerfilePath, 'utf8');
    expect(content).toContain('mcr.microsoft.com/playwright:v1.48.2-jammy');
    expect(content).toContain('fonts-dejavu-core');
    expect(content).toContain('fonts-liberation');
    expect(content).toContain('fonts-freefont-ttf');
    expect(content).toContain('fonts-noto-core');
    expect(content).toContain('xvfb-run');
  });
});
