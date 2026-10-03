/**
 * Bucketing functions for the six style features. Every threshold is a research decision recorded
 * with its justification in PROJECT_LOG.md (section 12). All intervals are half-open at the lower
 * bound: a value exactly on a threshold belongs to the bucket above it.
 *
 * Bucketing is what buys cross-browser stability: a control at 14.4px in one engine and 14.66px in
 * another lands in one bucket, while the same control shrunk to 6px does not.
 */

export type SizeBucket = 'tiny' | 'smaller' | 'base' | 'larger' | 'huge';
export type WeightBucket = 'light' | 'normal' | 'bold';
export type ContrastBucket = 'low' | 'medium' | 'high';
export type ProminenceBucket = 'suppressed' | 'equal' | 'dominant';
export type OcclusionBucket = 'clear' | 'partial' | 'blocked';

export const THRESHOLDS = {
  size: [0.6, 0.85, 1.2, 1.6],
  weight: [400, 600],
  contrast: [3.0, 4.5],
  prominence: [0.6, 1.6],
  occlusion: [0.2, 0.8],
  /** effective opacity below this counts as invisible */
  opacity: 0.1,
} as const;

/** Ratio of the node's font size to the region's base font size. */
export function sizeBucket(ratio: number): SizeBucket {
  const [a, b, c, d] = THRESHOLDS.size;
  if (ratio < a) return 'tiny';
  if (ratio < b) return 'smaller';
  if (ratio < c) return 'base';
  if (ratio < d) return 'larger';
  return 'huge';
}

/** Computed numeric font-weight. */
export function weightBucket(weight: number): WeightBucket {
  const [a, b] = THRESHOLDS.weight;
  if (weight < a) return 'light';
  if (weight < b) return 'normal';
  return 'bold';
}

/** WCAG 2.1 contrast ratio of text against its effective background. */
export function contrastBucket(ratio: number): ContrastBucket {
  const [a, b] = THRESHOLDS.contrast;
  if (ratio < a) return 'low';
  if (ratio < b) return 'medium';
  return 'high';
}

/** A control's area divided by the median area of its sibling controls. */
export function prominenceBucket(ratio: number): ProminenceBucket {
  const [a, b] = THRESHOLDS.prominence;
  if (ratio < a) return 'suppressed';
  if (ratio >= b) return 'dominant';
  return 'equal';
}

/** Fraction of sample points at which a foreign element is the topmost hit. */
export function occlusionBucket(fraction: number): OcclusionBucket {
  const [a, b] = THRESHOLDS.occlusion;
  if (fraction < a) return 'clear';
  if (fraction >= b) return 'blocked';
  return 'partial';
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
