import { render, screen } from '@testing-library/react';
import { MerkleTreeView } from '../src/components/MerkleTreeView';
import { jcs } from '../src/lib/bundle';
import { walkInclusion } from '../src/lib/logProof';

// Reference tree built independently of the code under test (RFC 6962 recursion).
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

async function fixture(size: number, index: number) {
  const leaves = await Promise.all(
    Array.from({ length: size }, async (_, i) =>
      sha(cat(Uint8Array.of(0), enc(jcs({ kind: 'test', n: i })))),
    ),
  );
  return {
    proof: {
      leaf_index: index,
      tree_size: size,
      leaf_hash: hex(leaves[index]),
      path: (await path(index, leaves)).map(hex),
    },
    root: hex(await mth(leaves)),
  };
}

describe('walking an inclusion proof', () => {
  it('reaches the reference root for every leaf of trees of several sizes', async () => {
    for (const size of [1, 2, 3, 5, 7, 8, 13]) {
      for (let i = 0; i < size; i++) {
        const f = await fixture(size, i);
        const walk = await walkInclusion(f.proof);
        expect(walk).not.toBeNull();
        expect(walk!.complete).toBe(true);
        expect(walk!.root).toBe(f.root);
        expect(walk!.steps).toHaveLength(f.proof.path.length);
      }
    }
  });

  it('refuses input that cannot be a proof', async () => {
    const f = await fixture(7, 3);
    expect(await walkInclusion({ ...f.proof, leaf_index: 9 })).toBeNull();
    expect(
      await walkInclusion({ ...f.proof, path: [...f.proof.path, 'ab'.repeat(32)] }),
    ).toBeNull();
    const short = await walkInclusion({ ...f.proof, path: f.proof.path.slice(1) });
    expect(short === null || short.complete === false || short.root !== f.root).toBe(true);
  });
});

describe('Merkle tree view', () => {
  async function tree(size: number, index: number, signedRoot?: string) {
    const f = await fixture(size, index);
    return {
      walk: (await walkInclusion(f.proof))!,
      signedRoot: signedRoot ?? f.root,
      leafIndex: index,
      treeSize: size,
    };
  }

  it('draws the record, one sibling per step and the root, and says the path ends at the signed root', async () => {
    const t = await tree(7, 3);
    const { container } = render(<MerkleTreeView tree={t} />);
    expect(container.querySelectorAll('.merkle-node.leaf')).toHaveLength(1);
    expect(container.querySelectorAll('.merkle-node.root')).toHaveLength(1);
    expect(container.querySelectorAll('.merkle-node.sibling')).toHaveLength(t.walk.steps.length);
    expect(screen.getByText('The path ends at the signed root.')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName(/entry 3 .* log of 7 entries/);
  });

  it('says so when the path does not reach the signed root', async () => {
    const t = await tree(7, 3, 'cd'.repeat(32));
    render(<MerkleTreeView tree={t} />);
    expect(screen.getByText('The path does not reach the signed root.')).toBeInTheDocument();
  });

  it('describes each step in text for screen readers', async () => {
    const t = await tree(5, 4);
    render(<MerkleTreeView tree={t} />);
    expect(screen.getAllByText(/^Step \d+: combined with a sibling hash/)).toHaveLength(
      t.walk.steps.length,
    );
  });
});
