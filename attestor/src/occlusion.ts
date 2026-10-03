import { occlusionBucket } from './buckets';
import type { OcclusionBucket } from './buckets';
import { CONTROL_ROLES } from './roles';
import type { Role } from './roles';

export interface Point {
  x: number;
  y: number;
}

/** Centre plus the four quarter points: five samples spread over the element's box. */
export function samplePoints(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): Point[] {
  const at = (fx: number, fy: number): Point => ({
    x: rect.left + rect.width * fx,
    y: rect.top + rect.height * fy,
  });
  return [at(0.5, 0.5), at(0.25, 0.25), at(0.75, 0.25), at(0.25, 0.75), at(0.75, 0.75)];
}

/**
 * Whether `hit` (the topmost element at a point) counts as the element itself being reachable.
 * The element, its descendants, and a label that activates it are fine. An ancestor is fine for
 * text nodes (their `el` is the container) but not for controls: an ancestor on top of a control
 * means the control cannot be hit (for example pointer-events: none).
 */
export function isOwnHit(el: Element, hit: Element, role: Role): boolean {
  if (hit === el || el.contains(hit)) return true;
  const label = hit.closest('label');
  if (label && (label as HTMLLabelElement).control === el) return true;
  return !CONTROL_ROLES.includes(role) && hit.contains(el);
}

/**
 * Fraction of the five points covered by a foreign element. Points outside the viewport cannot be
 * hit-tested and are not counted; if none can be tested the node is reported clear (its
 * `visible` feature still carries any hiding signal).
 */
export function occlusionFraction(el: Element, role: Role): number {
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  if (!view) return 0;
  const points = samplePoints(el.getBoundingClientRect());
  let tested = 0;
  let foreign = 0;
  for (const p of points) {
    if (p.x < 0 || p.y < 0 || p.x >= view.innerWidth || p.y >= view.innerHeight) continue;
    const hit = doc.elementFromPoint(p.x, p.y);
    if (hit === null) continue;
    tested++;
    if (!isOwnHit(el, hit, role)) foreign++;
  }
  return tested === 0 ? 0 : foreign / tested;
}

export function measureOcclusion(el: Element, role: Role): OcclusionBucket {
  return occlusionBucket(occlusionFraction(el, role));
}
