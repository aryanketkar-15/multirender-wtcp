import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordedPanel } from '../src/components/RecordedPanel';
import * as apiModule from '../src/lib/api';
import { jcs } from '../src/lib/bundle';
import { checkRecordInLog, leafHashOf, verifyInclusion } from '../src/lib/logProof';

// A small reference tree built independently of the code under test (RFC 6962 recursion).
const enc = (s: string) => new TextEncoder().encode(s);
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = async (b: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource));
const cat = (...p: Uint8Array[]) => Uint8Array.from(p.flatMap((x) => [...x]));
const node = async (l: Uint8Array, r: Uint8Array) => sha(cat(Uint8Array.of(1), l, r));

async function mth(leaves: Uint8Array[]): Promise<Uint8Array> {
  if (leaves.length === 1) return leaves[0];
  let k = 1;
  while (k * 2 < leaves.length) k *= 2;
  return node(await mth(leaves.slice(0, k)), await mth(leaves.slice(k)));
}
async function path(m: number, leaves: Uint8Array[]): Promise<Uint8Array[]> {
  if (leaves.length === 1) return [];
  let k = 1;
  while (k * 2 < leaves.length) k *= 2;
  return m < k
    ? [...(await path(m, leaves.slice(0, k))), await mth(leaves.slice(k))]
    : [...(await path(m - k, leaves.slice(k))), await mth(leaves.slice(0, k))];
}

const records = Array.from({ length: 7 }, (_, i) => ({
  kind: 'test',
  ref_hash: 'sha256:' + String(i).repeat(64),
  n: i,
}));

async function fixture(index: number) {
  const leaves = await Promise.all(
    records.map(async (r) => sha(cat(Uint8Array.of(0), enc(jcs(r))))),
  );
  const root = hex(await mth(leaves));
  return {
    leaf: { index, kind: 'test', record: records[index] },
    proof: {
      leaf_index: index,
      tree_size: leaves.length,
      leaf_hash: hex(leaves[index]),
      path: (await path(index, leaves)).map(hex),
    },
    tree_head: { record: { tree_size: leaves.length, root_hash: 'sha256:' + root } },
    root,
  };
}

describe('browser-side log check', () => {
  afterEach(() => jest.restoreAllMocks());

  it('verifies every leaf of a 7-leaf tree', async () => {
    for (let i = 0; i < 7; i++) {
      const f = await fixture(i);
      expect(await verifyInclusion(f.proof, f.root)).toBe(true);
    }
  });

  it('rejects a wrong root, a wrong leaf, a short path and a wrong index', async () => {
    const f = await fixture(3);
    expect(await verifyInclusion(f.proof, '0'.repeat(64))).toBe(false);
    expect(await verifyInclusion({ ...f.proof, leaf_hash: '1'.repeat(64) }, f.root)).toBe(false);
    expect(await verifyInclusion({ ...f.proof, path: f.proof.path.slice(1) }, f.root)).toBe(false);
    expect(await verifyInclusion({ ...f.proof, leaf_index: 4 }, f.root)).toBe(false);
  });

  it('hashes a leaf with the 0x00 prefix, not the node prefix', async () => {
    const plain = hex(await sha(enc('abc')));
    expect(await leafHashOf('abc')).not.toBe(plain);
    expect(await leafHashOf('abc')).toBe(hex(await sha(cat(Uint8Array.of(0), enc('abc')))));
  });

  it('passes every step for an honest log response', async () => {
    const f = await fixture(2);
    jest.spyOn(apiModule.api, 'get').mockResolvedValue({ ok: true, status: 200, data: f as never });
    const result = await checkRecordInLog(2, records[2].ref_hash);
    expect(result.ok).toBe(true);
    expect(result.steps).toHaveLength(4);
  });

  it('fails when the logged record was altered after hashing', async () => {
    const f = await fixture(2);
    f.leaf.record = { ...records[2], n: 99 };
    jest.spyOn(apiModule.api, 'get').mockResolvedValue({ ok: true, status: 200, data: f as never });
    const result = await checkRecordInLog(2, records[2].ref_hash);
    expect(result.ok).toBe(false);
    expect(result.steps.find((s) => s.label.includes('hashes to the leaf'))?.ok).toBe(false);
  });

  it('fails when the log entry is not the attestation we recorded', async () => {
    const f = await fixture(2);
    jest.spyOn(apiModule.api, 'get').mockResolvedValue({ ok: true, status: 200, data: f as never });
    expect((await checkRecordInLog(2, 'sha256:' + 'f'.repeat(64))).ok).toBe(false);
  });

  it('reports a missing proof plainly', async () => {
    jest
      .spyOn(apiModule.api, 'get')
      .mockResolvedValue({ ok: false, status: 409, data: {} as never });
    const result = await checkRecordInLog(2, 'x');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/does not have a proof/);
  });
});

describe('RecordedPanel', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows the reference and both log entries, and lets the user run the check', async () => {
    const f = await fixture(5);
    jest.spyOn(apiModule.api, 'get').mockResolvedValue({ ok: true, status: 200, data: f as never });
    const user = userEvent.setup();
    render(
      <RecordedPanel
        action="accept"
        attestationHash={records[5].ref_hash}
        logLeafIndex={5}
        commitmentLeafIndex={4}
      />,
    );
    expect(screen.getByText(/entry 5/)).toHaveTextContent('entry 4');
    await user.click(screen.getByRole('button', { name: 'Check this record in the log' }));
    expect(await screen.findByText('Verified in the log.')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Passed' })).toHaveLength(4);
  });

  it('offers to start over, and hides the log check when no entry is known', () => {
    render(
      <RecordedPanel
        action="reject"
        attestationHash="sha256:x"
        logLeafIndex={null}
        commitmentLeafIndex={null}
      />,
    );
    expect(screen.getByRole('button', { name: 'Start over' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Check this record/ })).not.toBeInTheDocument();
  });

  it('shows a failure when the proof does not verify', async () => {
    const f = await fixture(1);
    f.proof.path = f.proof.path.slice(1);
    jest.spyOn(apiModule.api, 'get').mockResolvedValue({ ok: true, status: 200, data: f as never });
    const user = userEvent.setup();
    render(
      <RecordedPanel
        action="accept"
        attestationHash={records[1].ref_hash}
        logLeafIndex={1}
        commitmentLeafIndex={0}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Check this record in the log' }));
    expect(await screen.findByText('Could not verify.')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Failed' }).length).toBeGreaterThan(0);
  });
});
