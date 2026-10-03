import {
  THRESHOLDS,
  contrastBucket,
  median,
  prominenceBucket,
  sizeBucket,
  weightBucket,
} from './buckets';
import type { ContrastBucket, ProminenceBucket, SizeBucket, WeightBucket } from './buckets';
import { elementContrast } from './contrast';

export interface StyleBuckets {
  size: SizeBucket;
  weight: WeightBucket;
  contrast: ContrastBucket;
  /** only for buttons */
  prominence?: ProminenceBucket;
}

/** The region's base font size: the computed font size of the container, in CSS pixels. */
export function baseFontSize(root: Element): number {
  const px = parseFloat(getComputedStyle(root).fontSize);
  return Number.isFinite(px) && px > 0 ? px : 16;
}

/** size, weight and contrast for one element. Prominence is added separately (needs siblings). */
export function measureStyle(el: Element, basePx: number): StyleBuckets {
  const cs = getComputedStyle(el);
  const size = parseFloat(cs.fontSize);
  const weight = parseInt(cs.fontWeight, 10);
  return {
    size: sizeBucket((Number.isFinite(size) ? size : basePx) / basePx),
    weight: weightBucket(Number.isFinite(weight) ? weight : 400),
    contrast: contrastBucket(elementContrast(el)),
  };
}

function area(el: Element): number {
  const r = el.getBoundingClientRect();
  return Math.max(0, r.width) * Math.max(0, r.height);
}

/**
 * Prominence of each button: its area divided by the median area of the other buttons in the
 * group. A lone button is `equal`. Zero-area siblings do not count as comparison targets, so a
 * hidden button cannot skew the median; a zero-area button is itself `suppressed`.
 */
export function prominenceOf(buttons: Element[]): Map<Element, ProminenceBucket> {
  const result = new Map<Element, ProminenceBucket>();
  const areas = new Map(buttons.map((b) => [b, area(b)] as const));
  for (const b of buttons) {
    const others = buttons
      .filter((o) => o !== b && (areas.get(o) ?? 0) > 0)
      .map((o) => areas.get(o) ?? 0);
    if (others.length === 0) {
      result.set(b, 'equal');
      continue;
    }
    result.set(b, prominenceBucket((areas.get(b) ?? 0) / median(others)));
  }
  return result;
}

/**
 * Visible to a person: not display:none, not visibility:hidden, effective opacity at least 0.1,
 * non-zero size, not positioned off the top/left of the page, and not clipped away by an
 * overflow-hidden ancestor. "In viewport" is read as "not off-canvas" rather than "inside the
 * current window", so below-the-fold content is visible at every window size; otherwise the
 * viewport would leak into the digest.
 */
export function isVisible(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  let opacity = 1;
  for (let node: Element | null = el; node; node = node.parentElement) {
    const cs = view.getComputedStyle(node);
    if (cs.display === 'none') return false;
    if (node === el && (cs.visibility === 'hidden' || cs.visibility === 'collapse')) return false;
    opacity *= Number(cs.opacity);
  }
  if (opacity < THRESHOLDS.opacity) return false;

  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (rect.right + view.scrollX <= 0 || rect.bottom + view.scrollY <= 0) return false;

  for (let node = el.parentElement; node; node = node.parentElement) {
    const cs = view.getComputedStyle(node);
    const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
    if (
      clips &&
      (cs.overflowX === 'hidden' ||
        cs.overflowX === 'clip' ||
        cs.overflowY === 'hidden' ||
        cs.overflowY === 'clip')
    ) {
      const box = node.getBoundingClientRect();
      const overlaps =
        rect.right > box.left &&
        rect.left < box.right &&
        rect.bottom > box.top &&
        rect.top < box.bottom;
      if (!overlaps) return false;
    }
  }
  return true;
}
