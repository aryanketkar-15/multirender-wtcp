import crypto from 'node:crypto';

const LEAF_PREFIX = Buffer.from([0]);
const NODE_PREFIX = Buffer.from([1]);

/**
 * RFC 6962 leaf hash: SHA-256(0x00 || canonicalText)
 */
export function computeLeafHash(canonicalText: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(LEAF_PREFIX)
    .update(Buffer.from(canonicalText, 'utf8'))
    .digest('hex');
  return hash;
}

/**
 * RFC 6962 interior node hash: SHA-256(0x01 || left || right)
 */
export function nodeHash(left: Uint8Array, right: Uint8Array): Buffer {
  return Buffer.from(
    crypto.createHash('sha256').update(NODE_PREFIX).update(left).update(right).digest(),
  );
}

/**
 * RFC 6962 / RFC 9162 inclusion proof verification.
 * Verifies that the leaf at leaf_index is included in a tree of tree_size with root rootHex.
 */
export function verifyInclusion(
  proof: { leaf_index: number; tree_size: number; leaf_hash: string; path: string[] },
  rootHex: string,
): boolean {
  let fn = proof.leaf_index;
  let sn = proof.tree_size - 1;
  if (fn < 0 || fn > sn) {
    return false;
  }

  const cleanLeafHash = proof.leaf_hash.replace(/^sha256:/i, '').toLowerCase();
  const cleanRootHex = rootHex.replace(/^sha256:/i, '').toLowerCase();

  let r: Buffer = Buffer.from(cleanLeafHash, 'hex');
  if (r.length !== 32) {
    return false;
  }

  for (const hex of proof.path) {
    const p = Buffer.from(hex.replace(/^sha256:/i, ''), 'hex');
    if (p.length !== 32 || sn === 0) {
      return false;
    }

    if ((fn & 1) === 1 || fn === sn) {
      r = nodeHash(p, r);
      if ((fn & 1) === 0) {
        while ((fn & 1) === 0 && fn !== 0) {
          fn >>= 1;
          sn >>= 1;
        }
      }
    } else {
      r = nodeHash(r, p);
    }
    fn >>= 1;
    sn >>= 1;
  }

  return sn === 0 && r.toString('hex') === cleanRootHex;
}

/**
 * Verify proof against signed tree head record.
 */
export function verifyAgainstHead(
  proof: { leaf_index: number; tree_size: number; leaf_hash: string; path: string[] },
  headRecord: { tree_size: number; root_hash: string },
): boolean {
  if (proof.tree_size !== headRecord.tree_size) {
    return false;
  }
  return verifyInclusion(proof, headRecord.root_hash);
}
