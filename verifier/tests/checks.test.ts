import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { generateAllFixtures } from '../src/fixtureGenerator';
import { verifyPackStages1To10 } from '../src/checks/verify';
import { Verdict } from '../src/verdicts';
import { handleRequest } from '../src/server';

describe('Milestone 5.2 — Independent Verifier Skeleton & Cheap Checks', () => {
  let serverPublicKeyHex: string;
  let fixtures: Record<string, Buffer>;
  const fixturesDir = path.join(__dirname, '..', 'fixtures');

  beforeAll(() => {
    // Generate fixtures and ensure verifier/fixtures directory contains all ZIP files
    const generated = generateAllFixtures();
    serverPublicKeyHex = generated.serverPublicKeyHex;
    fixtures = generated.fixtures;

    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    for (const [name, buf] of Object.entries(fixtures)) {
      fs.writeFileSync(path.join(fixturesDir, `${name}.zip`), buf);
    }
    fs.writeFileSync(path.join(fixturesDir, 'server_public_key.txt'), serverPublicKeyHex);
  });

  // -------------------------------------------------------------
  // T5.2.1: Valid pack passes stages 1–10
  // -------------------------------------------------------------
  test('T5.2.1: Honest pack passes stages 1–10 and proceeds to render stage', () => {
    const zip = fixtures.honest_pack;
    const result = verifyPackStages1To10(zip, { serverPublicKeyHex });

    expect(result.ok).toBe(true);
    expect(result.verdict).toBe(Verdict.PROCEEDS_TO_RENDER);
    expect(result.passedStages).toBe(10);
    expect(result.stages.length).toBe(10);
    for (const stage of result.stages) {
      expect(stage.ok).toBe(true);
    }
  });

  // -------------------------------------------------------------
  // T5.2.2: Malformed ZIP
  // -------------------------------------------------------------
  test('T5.2.2: Corrupt ZIP file returns MALFORMED_PACK', () => {
    const zip = fixtures.malformed;
    const result = verifyPackStages1To10(zip, { serverPublicKeyHex });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe(Verdict.MALFORMED_PACK);
    expect(result.failedStage).toBe(1);
    expect(result.passedStages).toBe(0);
  });

  // -------------------------------------------------------------
  // T5.2.3: Bad server signature
  // -------------------------------------------------------------
  test('T5.2.3: Bad server signature on commitment returns SERVER_SIGNATURE_INVALID', () => {
    const zip = fixtures.bad_server_signature;
    const result = verifyPackStages1To10(zip, { serverPublicKeyHex });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe(Verdict.SERVER_SIGNATURE_INVALID);
    expect(result.failedStage).toBe(2);
    expect(result.passedStages).toBe(1);
  });

  // -------------------------------------------------------------
  // T5.2.4: Edited pack (client signature invalid)
  // -------------------------------------------------------------
  test('T5.2.4: Edited attestation text returns CLIENT_SIGNATURE_INVALID', () => {
    const zip = fixtures.edited_attestation;
    const result = verifyPackStages1To10(zip, { serverPublicKeyHex });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe(Verdict.CLIENT_SIGNATURE_INVALID);
    expect(result.failedStage).toBe(3);
    expect(result.passedStages).toBe(2);
  });

  // -------------------------------------------------------------
  // T5.2.5: Fingerprint mismatch (key binding invalid)
  // -------------------------------------------------------------
  test('T5.2.5: Client key fingerprint mismatch returns KEY_BINDING_INVALID', () => {
    const zip = fixtures.fingerprint_mismatch;
    const result = verifyPackStages1To10(zip, { serverPublicKeyHex });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe(Verdict.KEY_BINDING_INVALID);
    expect(result.failedStage).toBe(4);
    expect(result.passedStages).toBe(3);
  });

  // -------------------------------------------------------------
  // T5.2.6: Tampered bundle
  // -------------------------------------------------------------
  test('T5.2.6: Tampered bundle markup returns BUNDLE_TAMPERED', () => {
    const zip = fixtures.tampered_bundle;
    const result = verifyPackStages1To10(zip, { serverPublicKeyHex });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe(Verdict.BUNDLE_TAMPERED);
    expect(result.failedStage).toBe(5);
    expect(result.passedStages).toBe(4);
  });

  // -------------------------------------------------------------
  // T5.2.7: Commitment binding broken
  // -------------------------------------------------------------
  test('T5.2.7: Mismatched commitment_hash in attestation returns COMMITMENT_BINDING_INVALID', () => {
    const zip = fixtures.commitment_binding_broken;
    const result = verifyPackStages1To10(zip, { serverPublicKeyHex });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe(Verdict.COMMITMENT_BINDING_INVALID);
    expect(result.failedStage).toBe(6);
    expect(result.passedStages).toBe(5);
  });

  // -------------------------------------------------------------
  // T5.2.8: Expired window / Nonce mismatch
  // -------------------------------------------------------------
  test('T5.2.8: Interaction outside commitment validity window returns REPLAY_DETECTED', () => {
    const zip = fixtures.expired_window;
    const result = verifyPackStages1To10(zip, { serverPublicKeyHex });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe(Verdict.REPLAY_DETECTED);
    expect(result.failedStage).toBe(7);
    expect(result.passedStages).toBe(6);
  });

  // -------------------------------------------------------------
  // T5.2.9: Bad Merkle proof
  // -------------------------------------------------------------
  test('T5.2.9: Invalid Merkle inclusion proof path returns MERKLE_PROOF_INVALID', () => {
    const zip = fixtures.bad_merkle_proof;
    const result = verifyPackStages1To10(zip, { serverPublicKeyHex });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe(Verdict.MERKLE_PROOF_INVALID);
    expect(result.failedStage).toBe(8);
    expect(result.passedStages).toBe(7);
  });

  // -------------------------------------------------------------
  // T5.2.10: Leaf order inverted (j < i)
  // -------------------------------------------------------------
  test('T5.2.10: Leaf order inverted (attestation precedes commitment) returns MERKLE_PROOF_INVALID', () => {
    const zip = fixtures.leaf_order_inverted;
    const result = verifyPackStages1To10(zip, { serverPublicKeyHex });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe(Verdict.MERKLE_PROOF_INVALID);
    expect(result.failedStage).toBe(8);
    expect(result.passedStages).toBe(7);
    expect(result.stages[7].message).toContain('Leaf order inverted');
  });

  // -------------------------------------------------------------
  // T5.2.11: Region policy violation
  // -------------------------------------------------------------
  test('T5.2.11: Bundle missing required reject control returns REGION_POLICY_VIOLATION', () => {
    const zip = fixtures.region_policy_violation;
    const result = verifyPackStages1To10(zip, { serverPublicKeyHex });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe(Verdict.REGION_POLICY_VIOLATION);
    expect(result.failedStage).toBe(9);
    expect(result.passedStages).toBe(8);
  });

  // -------------------------------------------------------------
  // T5.2.12: Unknown attestor
  // -------------------------------------------------------------
  test('T5.2.12: Unrecognised attestor hash returns ATTESTOR_UNRECOGNISED', () => {
    const zip = fixtures.unknown_attestor;
    const result = verifyPackStages1To10(zip, { serverPublicKeyHex });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe(Verdict.ATTESTOR_UNRECOGNISED);
    expect(result.failedStage).toBe(10);
    expect(result.passedStages).toBe(9);
  });

  // -------------------------------------------------------------
  // T5.2.13: No server dependency (independence verified offline)
  // -------------------------------------------------------------
  test('T5.2.13: Verification succeeds with zero network calls and attestation server offline', () => {
    // Zero database, zero HTTP fetch, honest pack verified strictly with local key
    const zip = fixtures.honest_pack;
    const result = verifyPackStages1To10(zip, {
      serverPublicKeyHex,
      recognizedAttestors: [
        'sha256:f805f3642219c751e5e76699bb096aeb63ce5946e20a32748121bebb3cb2949a',
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.verdict).toBe(Verdict.PROCEEDS_TO_RENDER);
    expect(result.passedStages).toBe(10);
  });

  // -------------------------------------------------------------
  // HTTP POST /verify Service Tests
  // -------------------------------------------------------------
  describe('HTTP Server POST /verify endpoint', () => {
    let server: http.Server;
    let port: number;

    beforeAll((done) => {
      server = http.createServer((req, res) => {
        handleRequest(req, res, { serverPublicKeyHex });
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        port = addr.port;
        done();
      });
    });

    afterAll((done) => {
      server.close(done);
    });

    test('GET /health returns 200 with service info', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; service: string };
      expect(body.ok).toBe(true);
      expect(body.service).toBe('mra-verifier');
    });

    test('POST /verify with valid pack returns PROCEEDS_TO_RENDER', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/verify?skip_render=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: new Uint8Array(fixtures.honest_pack),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; verdict: string; passedStages: number };
      expect(body.ok).toBe(true);
      expect(body.verdict).toBe(Verdict.PROCEEDS_TO_RENDER);
      expect(body.passedStages).toBe(10);
    });

    test('POST /verify with tampered bundle returns BUNDLE_TAMPERED', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: new Uint8Array(fixtures.tampered_bundle),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; verdict: string };
      expect(body.ok).toBe(false);
      expect(body.verdict).toBe(Verdict.BUNDLE_TAMPERED);
    });
  });
});
