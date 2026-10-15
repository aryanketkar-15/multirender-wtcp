import { createAttestation } from '../src/lib/attestation';
import { getClientKey, resetClientKeyForTests } from '../src/lib/clientKey';

const evidence = {
  critical_region_digest: 'sha256:' + '1'.repeat(64),
  context_digest: 'sha256:' + '2'.repeat(64),
  env: { engine: 'Blink', engine_major: '153' },
  attestor_version: '1.1.0',
  region_nodes: 2,
  context_nodes: 3,
};
const commitment = {
  session_id: 's'.repeat(32),
  nonce: 'n'.repeat(64),
  attestor_hash: 'sha256:' + 'c'.repeat(64),
};

describe('the region representation travels beside the signed attestation', () => {
  beforeEach(() => resetClientKeyForTests());

  it('is attached to the payload but is not part of what is signed', async () => {
    const pair = await getClientKey();
    const representation = {
      v: 'srd/1.0',
      policy: 'consent/v1',
      nodes: [{ i: 0, role: 'paragraph' }],
    };
    const withRep = await createAttestation({
      commitment,
      commitmentHash: 'sha256:' + 'd'.repeat(64),
      action: 'accept',
      actionTarget: 'btn-agree',
      evidence: { ...evidence, region_representation: representation },
      pair,
      now: new Date('2026-10-15T10:00:00Z'),
    });
    expect(withRep.region_representation).toEqual(representation);
    expect(Object.keys(withRep.attestation)).not.toContain('region_representation');
    expect(JSON.stringify(withRep.attestation)).not.toContain('srd/1.0');
  });

  it('is simply absent when the Attestor does not provide it (version 1.0.0)', async () => {
    const pair = await getClientKey();
    const signed = await createAttestation({
      commitment,
      commitmentHash: 'sha256:' + 'd'.repeat(64),
      action: 'reject',
      actionTarget: 'btn-reject',
      evidence,
      pair,
    });
    expect('region_representation' in signed).toBe(false);
  });
});
