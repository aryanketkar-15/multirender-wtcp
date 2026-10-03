import { extractNodes } from './extract';
import type { RawNode } from './extract';
import { normalise } from './normalise';
import { measureOcclusion } from './occlusion';
import type { OcclusionBucket } from './buckets';
import { CONTROL_ROLES } from './roles';
import type { Role } from './roles';
import { baseFontSize, isVisible, measureStyle, prominenceOf } from './styles';
import type { StyleBuckets } from './styles';

export const SRD_VERSION = 'srd/1.0';

/** One node of the semantic representation. Only bucketed or normalised values, never raw ones. */
export interface SrdNode {
  i: number;
  role: Role;
  level?: number;
  text?: string;
  name?: string;
  checked?: boolean;
  disabled?: boolean;
  required?: boolean;
  selected?: boolean;
  visible: boolean;
  occlusion: OcclusionBucket;
  style?: StyleBuckets;
}

export interface Representation {
  v: typeof SRD_VERSION;
  policy: string;
  nodes: SrdNode[];
}

/** Roles that read as text: normalised text, plus size, weight and contrast. */
const TEXT_ROLES: readonly Role[] = ['heading', 'paragraph', 'text'];
/** Roles whose appearance matters but whose state is the point: no style block. */
const STATE_ROLES: readonly Role[] = ['checkbox', 'radio', 'switch'];

/**
 * Builds the semantic representation of everything under `root`.
 *
 * Environment (viewport, device pixel ratio, forced colours) is deliberately not part of this
 * object: it is recorded beside the digest, never inside it (decision D-08).
 *
 * Divergence from the design document's example, recorded: headings carry a style block as well,
 * because a shrunken heading is a manipulation of the same kind as a shrunken paragraph.
 */
export function buildRepresentation(root: Element, policy: string): Representation {
  const raw = extractNodes(root);
  const base = baseFontSize(root);
  const buttons = raw.filter((n) => n.role === 'button').map((n) => n.el);
  const prominence = prominenceOf(buttons);

  const nodes: SrdNode[] = [];
  for (const n of raw) {
    const node = toNode(n, base, prominence.get(n.el));
    if (node === null) continue;
    nodes.push({ ...node, i: nodes.length });
  }
  return { v: SRD_VERSION, policy, nodes };
}

function toNode(n: RawNode, base: number, prominence: StyleBuckets['prominence']): SrdNode | null {
  const out: SrdNode = {
    i: 0,
    role: n.role,
    visible: isVisible(n.el),
    occlusion: measureOcclusion(n.el, n.role),
  };

  if (TEXT_ROLES.includes(n.role)) {
    const text = normalise(n.text ?? '');
    // Text that normalises to nothing (zero-width characters only, say) carries no meaning.
    if (text === '') return null;
    out.text = text;
    if (n.level !== undefined) out.level = n.level;
  } else {
    out.name = normalise(n.name ?? '');
    if (n.checked !== undefined) out.checked = n.checked;
    if (n.required !== undefined) out.required = n.required;
    if (n.disabled !== undefined) out.disabled = n.disabled;
    if (n.selected !== undefined) out.selected = n.selected;
  }

  if (!STATE_ROLES.includes(n.role)) {
    const style = measureStyle(n.el, base);
    if (n.role === 'button' && prominence !== undefined) style.prominence = prominence;
    out.style = style;
  }
  if (CONTROL_ROLES.includes(n.role) && n.disabled === undefined) out.disabled = false;
  return out;
}
