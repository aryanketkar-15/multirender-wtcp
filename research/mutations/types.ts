/**
 * mutations/types.ts
 * Shared types for the MRA mutation suite (Milestone 6.2).
 *
 * Each mutation is a deterministic, pure function that transforms a CorpusEntry
 * into a mutated clone. The same input always produces the same output (T6.2.2).
 *
 * Taxonomy sources:
 *   Nouwens2020 — Nouwens et al., CHI 2020
 *   Matte2020   — Matte et al., IEEE S&P 2020
 */

import type { CorpusEntry } from '../corpus/generate-manifest';

// ──────────────────────────────────────────────────────────
// Feature identifiers — the six digest axes that can catch
// a mutation, or "none" for the cosmetic control.
// ──────────────────────────────────────────────────────────
export type DigestFeature =
  | 'text_content'
  | 'aria_roles'
  | 'aria_states'
  | 'bounding_box_occlusion'
  | 'contrast_ratio'
  | 'none'; // cosmetic control — must NOT be caught

export type MutationCategory =
  | 'visual_interference'
  | 'obstruction'
  | 'pre_selection'
  | 'misleading_information'
  | 'text_obfuscation'
  | 'confirmshaming'
  | 'undisclosed_purpose'
  | 'undisclosed_vendor'
  | 'implied_consent'
  | 'ui_deception'
  | 'information_omission'
  | 'accessibility_bypass'
  | 'control_cosmetic';

export type Taxonomy = 'Nouwens2020' | 'Matte2020' | 'CONTROL';

/** Metadata describing a mutation (mirrors manifest.json). */
export interface MutationMeta {
  id: string;
  name: string;
  taxonomy: Taxonomy;
  taxonomy_ref: string;
  category: MutationCategory;
  description: string;
  target_feature: DigestFeature;
  severity: 'cosmetic' | 'low' | 'medium' | 'high' | 'critical';
  /** true if no digest feature targets this mutation (a known gap). */
  is_gap: boolean;
  /** Only set for control mutations. */
  expected_detected?: boolean;
}

/** A CorpusEntry after mutation, plus the mutation ID for traceability. */
export interface MutatedEntry extends CorpusEntry {
  mutation_id: string;
  mutation_name: string;
  /** True if this mutation changes a field the digest inspects. */
  is_semantically_mutated: boolean;
}

/** Signature every mutation module must export as default. */
export type MutationTransform = {
  meta: MutationMeta;
  /**
   * Apply this mutation to `entry`.
   * Must be deterministic: apply(apply(e)) === apply(e) (idempotent is fine,
   * but the important invariant is apply(e) is identical for identical e).
   */
  apply: (entry: CorpusEntry) => MutatedEntry;
};
