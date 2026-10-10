import type { DiffResult, MismatchedNode } from './verdicts';

export interface SrdNodeLike {
  i?: number;
  role: string;
  level?: number;
  text?: string;
  name?: string;
  checked?: boolean;
  disabled?: boolean;
  required?: boolean;
  selected?: boolean;
  visible?: boolean;
  occlusion?: string;
  style?: {
    size?: string;
    weight?: string;
    contrast?: string;
    prominence?: string;
  };
}

export interface RepresentationLike {
  v?: string;
  policy?: string;
  nodes: SrdNodeLike[];
}

/**
 * Perform fine-grained, node-level semantic diff between attested and recomputed representations.
 * Identifies the exact node index, accessible role, and field-level differences (e.g. text,
 * checked state, style buckets, prominence, occlusion).
 */
export function diffRepresentations(
  attested: RepresentationLike | SrdNodeLike[] | unknown,
  recomputed: RepresentationLike | SrdNodeLike[] | unknown,
): DiffResult {
  const attestedNodes: SrdNodeLike[] = Array.isArray(attested)
    ? attested
    : ((attested as RepresentationLike)?.nodes ?? []);
  const recomputedNodes: SrdNodeLike[] = Array.isArray(recomputed)
    ? recomputed
    : ((recomputed as RepresentationLike)?.nodes ?? []);

  const mismatchedNodes: MismatchedNode[] = [];
  const maxLen = Math.max(attestedNodes.length, recomputedNodes.length);

  for (let idx = 0; idx < maxLen; idx++) {
    const aNode = attestedNodes[idx];
    const rNode = recomputedNodes[idx];

    if (!aNode) {
      mismatchedNodes.push({
        index: idx,
        role: rNode.role,
        name: rNode.name,
        text: rNode.text,
        differences: {
          existence: { attested: null, recomputed: 'extra_node_in_recomputation' },
        },
        summary: `Node ${idx} (${rNode.role}${rNode.name ? ` "${rNode.name}"` : ''}): unexpected extra node present in recomputation`,
      });
      continue;
    }

    if (!rNode) {
      mismatchedNodes.push({
        index: idx,
        role: aNode.role,
        name: aNode.name,
        text: aNode.text,
        differences: {
          existence: { attested: 'node_present', recomputed: null },
        },
        summary: `Node ${idx} (${aNode.role}${aNode.name ? ` "${aNode.name}"` : ''}): missing from recomputation`,
      });
      continue;
    }

    const differences: Record<string, { attested: unknown; recomputed: unknown }> = {};

    if (aNode.role !== rNode.role) {
      differences['role'] = { attested: aNode.role, recomputed: rNode.role };
    }

    if (aNode.text !== rNode.text) {
      differences['text'] = { attested: aNode.text, recomputed: rNode.text };
    }

    if (aNode.name !== rNode.name) {
      differences['name'] = { attested: aNode.name, recomputed: rNode.name };
    }

    if (aNode.checked !== rNode.checked) {
      differences['checked'] = { attested: aNode.checked, recomputed: rNode.checked };
    }

    if (aNode.disabled !== rNode.disabled) {
      differences['disabled'] = { attested: aNode.disabled, recomputed: rNode.disabled };
    }

    if (aNode.required !== rNode.required) {
      differences['required'] = { attested: aNode.required, recomputed: rNode.required };
    }

    if (aNode.selected !== rNode.selected) {
      differences['selected'] = { attested: aNode.selected, recomputed: rNode.selected };
    }

    if (aNode.level !== rNode.level) {
      differences['level'] = { attested: aNode.level, recomputed: rNode.level };
    }

    if (aNode.visible !== rNode.visible) {
      differences['visible'] = { attested: aNode.visible, recomputed: rNode.visible };
    }

    if (aNode.occlusion !== rNode.occlusion) {
      differences['occlusion'] = { attested: aNode.occlusion, recomputed: rNode.occlusion };
    }

    // Style buckets comparison
    if (aNode.style || rNode.style) {
      const aStyle = aNode.style ?? {};
      const rStyle = rNode.style ?? {};

      if (aStyle.size !== rStyle.size) {
        differences['style.size'] = { attested: aStyle.size, recomputed: rStyle.size };
      }
      if (aStyle.weight !== rStyle.weight) {
        differences['style.weight'] = { attested: aStyle.weight, recomputed: rStyle.weight };
      }
      if (aStyle.contrast !== rStyle.contrast) {
        differences['style.contrast'] = { attested: aStyle.contrast, recomputed: rStyle.contrast };
      }
      if (aStyle.prominence !== rStyle.prominence) {
        differences['style.prominence'] = {
          attested: aStyle.prominence,
          recomputed: rStyle.prominence,
        };
      }
    }

    if (Object.keys(differences).length > 0) {
      const diffDescriptions = Object.entries(differences).map(
        ([field, val]) => `${field}: '${String(val.attested)}' vs '${String(val.recomputed)}'`,
      );

      const nodeLabel = aNode.name
        ? ` "${aNode.name}"`
        : aNode.text
          ? ` "${aNode.text.slice(0, 30)}..."`
          : '';
      mismatchedNodes.push({
        index: idx,
        role: aNode.role,
        name: aNode.name ?? rNode.name,
        text: aNode.text ?? rNode.text,
        differences,
        summary: `Node ${idx} (${aNode.role}${nodeLabel}): ${diffDescriptions.join(', ')}`,
      });
    }
  }

  const hasMismatch = mismatchedNodes.length > 0;
  const summary = hasMismatch
    ? `${mismatchedNodes.length} diverging node(s) detected: ${mismatchedNodes.map((m) => m.summary).join('; ')}`
    : 'No semantic differences found; representation trees are identical.';

  return {
    hasMismatch,
    totalAttestedNodes: attestedNodes.length,
    totalRecomputedNodes: recomputedNodes.length,
    mismatchedNodes,
    summary,
  };
}
