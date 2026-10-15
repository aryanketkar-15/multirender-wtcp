import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright';
import { launchPlaywrightBrowser, renderAndVerify } from '../src/render';
import { verifyPackStages1To10 } from '../src/checks/verify';
import { unpackPack } from '../src/checks/unpack';
import { Verdict } from '../src/verdicts';

/**
 * Packs produced by the real stack (milestone 6.3): the PHP server, the React client, the shipped
 * Attestor Module in real Chromium, downloaded from /api/pack/{id}/download.
 *
 *  - honest_pack: the user ticked the box and clicked Accept.
 *  - page_altered_after_load: the same flow, but a script rewrote the disclosure text after the page
 *    loaded and before the click (the attack of test T4.2.4).
 *
 * The synthetic fixtures in this package never exercised the real formats; with them the verifier
 * rejected every honest real pack (action target format) and, after that, reported a mismatch
 * (the client measured the page after locking its own controls). These tests keep both fixed.
 */
const dir = path.join(__dirname, '..', 'fixtures', 'real');
const serverKey = fs.readFileSync(path.join(dir, 'server_public_key.txt'), 'utf8').trim();
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'attestor', 'dist', 'manifest.json'), 'utf8'),
);
const attestorHash = String(manifest.sha256 ?? manifest.attestor_hash ?? manifest.hash);

function options(zip: Buffer) {
  const record = unpackPack(zip).attestation.record as { client_ts: string };
  return {
    serverPublicKeyHex: serverKey,
    recognizedAttestors: [attestorHash.startsWith('sha256:') ? attestorHash : `sha256:${attestorHash}`],
    referenceTime: record.client_ts,
  };
}

describe('real packs from the live stack', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchPlaywrightBrowser({ headless: process.env.HEADLESS === 'true' });
  });
  afterAll(async () => {
    await browser.close();
  });

  test('the honest pack passes the cheap checks and verifies after re-render', async () => {
    const zip = fs.readFileSync(path.join(dir, 'honest_pack.zip'));
    const cheap = verifyPackStages1To10(zip, options(zip));
    expect(cheap.verdict).toBe(Verdict.PROCEEDS_TO_RENDER);
    const result = await renderAndVerify(unpackPack(zip), { browser });
    expect(result.verdict).toBe(Verdict.VERIFIED);
  });

  test('a page rewritten after load is reported as a digest mismatch', async () => {
    const zip = fs.readFileSync(path.join(dir, 'page_altered_after_load.zip'));
    const cheap = verifyPackStages1To10(zip, options(zip));
    expect(cheap.verdict).toBe(Verdict.PROCEEDS_TO_RENDER);
    const result = await renderAndVerify(unpackPack(zip), { browser });
    expect(result.verdict).toBe(Verdict.DIGEST_MISMATCH);
  });

  test('the context digest of a real pack is not replayable from the bundle alone (O-08)', async () => {
    const zip = fs.readFileSync(path.join(dir, 'honest_pack.zip'));
    const result = await renderAndVerify(unpackPack(zip), { browser, compareContext: true });
    expect(result.verdict).toBe(Verdict.CONTEXT_MISMATCH);
  });
});
