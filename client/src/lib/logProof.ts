import { api } from './api';
import { jcs } from './bundle';

/**
 * Checks, in the browser, that a recorded attestation really is in the server's evidence log:
 * it fetches the inclusion proof, recomputes the leaf hash from the logged record itself, walks
 * the proof (RFC 9162) and compares the result with the root of the signed tree head.
 *
 * It does not verify the head's Ed25519 signature (browsers do not all support that curve); the
 * independent verifier and the published tree heads cover that. This is a spot check a person can
 * run, not a substitute for the verifier.
 */
export interface InclusionProof {
  leaf_index: number;
  tree_size: number;
  leaf_hash: string;
  path: string[];
}

interface ProofResponse {
  leaf: { index: number; kind: string; record: { attestation?: unknown; ref_hash?: string } };
  proof: InclusionProof;
  tree_head: { record: { tree_size: number; root_hash: string } };
}

export interface LogCheck {
  ok: boolean;
  steps: Array<{ label: string; ok: boolean }>;
  message?: string;
  /** What the tree picture draws: the walk the browser did and the root the log signed. */
  tree?: { walk: InclusionWalk; signedRoot: string; leafIndex: number; treeSize: number };
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

async function sha(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
}

const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

async function nodeHash(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  return sha(cat(Uint8Array.of(1), left, right));
}

export async function leafHashOf(canonical: string): Promise<string> {
  return hex(await sha(cat(Uint8Array.of(0), new TextEncoder().encode(canonical))));
}

/** One level of the walk from a leaf to the root: the sibling the log supplied and the hash it produced. */
export interface InclusionStep {
  sibling: string;
  /** Which side the log's sibling sits on, so the recomputed node sits on the other. */
  side: 'left' | 'right';
  hash: string;
}

export interface InclusionWalk {
  leaf: string;
  steps: InclusionStep[];
  /** The hash reached at the top of the walk. */
  root: string;
  /** True when the path was exactly as long as the tree needs. */
  complete: boolean;
}

/**
 * RFC 9162 section 2.1.3.2, keeping every intermediate hash so it can be shown. Returns null for
 * input that cannot be a proof (index outside the tree, or a path longer than the tree is deep).
 */
export async function walkInclusion(proof: InclusionProof): Promise<InclusionWalk | null> {
  let fn = proof.leaf_index;
  let sn = proof.tree_size - 1;
  if (fn < 0 || fn > sn) return null;
  let r: Uint8Array = unhex(proof.leaf_hash);
  const steps: InclusionStep[] = [];
  for (const h of proof.path) {
    const p = unhex(h);
    if (sn === 0) return null;
    if ((fn & 1) === 1 || fn === sn) {
      r = await nodeHash(p, r);
      steps.push({ sibling: h, side: 'left', hash: hex(r) });
      if ((fn & 1) === 0) {
        while ((fn & 1) === 0 && fn !== 0) {
          fn >>= 1;
          sn >>= 1;
        }
      }
    } else {
      r = await nodeHash(r, p);
      steps.push({ sibling: h, side: 'right', hash: hex(r) });
    }
    fn >>= 1;
    sn >>= 1;
  }
  return { leaf: proof.leaf_hash, steps, root: hex(r), complete: sn === 0 };
}

/** True when the path leads from the leaf to `rootHex`. */
export async function verifyInclusion(proof: InclusionProof, rootHex: string): Promise<boolean> {
  const walk = await walkInclusion(proof);
  return walk !== null && walk.complete && walk.root === rootHex;
}

export async function checkRecordInLog(
  leafIndex: number,
  attestationHash: string,
): Promise<LogCheck> {
  const res = await api.get<ProofResponse>(`/api/log/proof/${leafIndex}`);
  if (!res.ok) {
    return { ok: false, steps: [], message: 'The log does not have a proof for this record yet.' };
  }
  const { leaf, proof, tree_head: head } = res.data;
  const steps: LogCheck['steps'] = [];
  const step = (label: string, ok: boolean) => steps.push({ label, ok });

  const canonical = jcs(leaf.record);
  step('The logged record is this attestation', leaf.record.ref_hash === attestationHash);
  step(
    'The record hashes to the leaf the proof starts from',
    (await leafHashOf(canonical)) === proof.leaf_hash,
  );
  step('The proof is for the signed tree head’s size', proof.tree_size === head.record.tree_size);
  const signedRoot = head.record.root_hash.replace(/^sha256:/, '');
  step('The proof leads to the signed tree head’s root', await verifyInclusion(proof, signedRoot));
  const walk = await walkInclusion(proof);
  return {
    ok: steps.every((s) => s.ok),
    steps,
    tree: walk
      ? { walk, signedRoot, leafIndex: proof.leaf_index, treeSize: proof.tree_size }
      : undefined,
  };
}
