import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { Browser } from 'playwright';
import { launchPlaywrightBrowser, renderAndVerify } from '../src/render';
import { verifyPackStages1To10 } from '../src/checks/verify';
import { unpackPack, PackMalformedError } from '../src/checks/unpack';
import { Verdict } from '../src/verdicts';

/**
 * Packs produced by the real stack: the PHP server, the React client, the shipped Attestor Module
 * in real Chromium, downloaded from /api/pack/{id}/download.
 *
 *  - honest_pack / page_altered_after_load: Attestor 1.1.0, which ships the region representation, so
 *    a mismatch can name the node that differs.
 *  - v1_0_0_*: Attestor 1.0.0, no representation; the verifier must still handle these.
 *
 * "page altered after load" is the attack of test T4.2.4: a script rewrote the disclosure text after
 * the page loaded and before the click.
 *
 * The synthetic fixtures in this package never exercised the real formats; with them the verifier
 * rejected every honest real pack (action target format) and, after that, reported a mismatch
 * (the client measured the page after locking its own controls). These tests keep both fixed.
 */
const dist = path.join(__dirname, '..', '..', 'attestor', 'dist');
const dir = path.join(__dirname, '..', 'fixtures', 'real');
const serverKey = fs.readFileSync(path.join(dir, 'server_public_key.txt'), 'utf8').trim();
const hashOf = (manifestFile: string) => {
  const m = JSON.parse(fs.readFileSync(path.join(dist, manifestFile), 'utf8'));
  const h = String(m.sha256 ?? m.attestor_hash ?? m.hash);
  return h.startsWith('sha256:') ? h : `sha256:${h}`;
};
const V110 = hashOf('manifest.json');
const V100 = hashOf('manifest-1.0.0.json');

const read = (name: string) => fs.readFileSync(path.join(dir, name));

function options(zip: Buffer, attestor: string) {
  const record = unpackPack(zip).attestation.record as { client_ts: string };
  return {
    serverPublicKeyHex: serverKey,
    recognizedAttestors: [attestor],
    referenceTime: record.client_ts,
  };
}

describe('real packs from the live stack', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchPlaywrightBrowser({ headless: process.env.HEADLESS === 'true' });
  }, 30_000);
  afterAll(async () => {
    if (browser) await browser.close();
  }, 30_000);

  test('an honest pack passes the cheap checks and verifies after re-render', async () => {
    const zip = read('honest_pack.zip');
    expect(verifyPackStages1To10(zip, options(zip, V110)).verdict).toBe(Verdict.PROCEEDS_TO_RENDER);
    const result = await renderAndVerify(unpackPack(zip), { browser });
    expect(result.verdict).toBe(Verdict.VERIFIED);
    const details = result.stages[0].details as Record<string, unknown>;
    expect(details.replay_attestor_hash).toBe(V110);
    expect(details.replay_attestor_is_the_attested_build).toBe(true);
    expect(details.context_compared).toBe(false);
  });

  test('a page rewritten after load is reported with the node and both texts', async () => {
    const zip = read('page_altered_after_load.zip');
    expect(verifyPackStages1To10(zip, options(zip, V110)).verdict).toBe(Verdict.PROCEEDS_TO_RENDER);
    const result = await renderAndVerify(unpackPack(zip), { browser });
    expect(result.verdict).toBe(Verdict.DIGEST_MISMATCH);
    expect(result.diff?.mismatchedNodes).toHaveLength(1);
    const node = result.diff!.mismatchedNodes[0];
    expect(node.role).toBe('paragraph');
    // attested: what the user's page showed; recomputed: what the server committed to
    expect(node.differences.text?.attested).toBe('we will never share your data with anyone.');
    expect(String(node.differences.text?.recomputed)).toContain('we share your usage data');
  });

  test('packs from Attestor 1.0.0 carry no representation and still verify or mismatch', async () => {
    const honest = read('v1_0_0_honest_pack.zip');
    expect(unpackPack(honest).fileBuffers['representation.json']).toBeUndefined();
    expect(verifyPackStages1To10(honest, options(honest, V100)).verdict).toBe(
      Verdict.PROCEEDS_TO_RENDER,
    );
    const ok = await renderAndVerify(unpackPack(honest), { browser });
    expect(ok.verdict).toBe(Verdict.VERIFIED);
    // The replay used the 1.0.0 build the pack names, not the newest build.
    const details = ok.stages[0].details as Record<string, unknown>;
    expect(details.replay_attestor_hash).toBe(V100);

    const altered = read('v1_0_0_page_altered_after_load.zip');
    const bad = await renderAndVerify(unpackPack(altered), { browser });
    expect(bad.verdict).toBe(Verdict.DIGEST_MISMATCH);
    // Without a representation the verifier can say the region differs, not which node.
    expect(bad.diff?.mismatchedNodes[0].index).toBe(0);
  });

  test('a representation.json that is not what the signed digest hashes is refused', () => {
    const zip = new AdmZip(read('honest_pack.zip'));
    const rep = JSON.parse(zip.readAsText('representation.json'));
    rep.nodes[1].text = 'we never share your data';
    zip.updateFile('representation.json', Buffer.from(JSON.stringify(rep)));
    expect(() => unpackPack(zip.toBuffer())).toThrow(PackMalformedError);
    expect(() => unpackPack(zip.toBuffer())).toThrow(/signed region digest/);
  });

  test('the context digest of a real pack is not replayable from the bundle alone (O-08)', async () => {
    const result = await renderAndVerify(unpackPack(read('honest_pack.zip')), {
      browser,
      compareContext: true,
    });
    expect(result.verdict).toBe(Verdict.CONTEXT_MISMATCH);
  });
});
