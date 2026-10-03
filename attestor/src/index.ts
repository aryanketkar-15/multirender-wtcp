export const ATTESTOR_VERSION = '0.1.0';

export { ROLES, accessibleName, roleOf } from './roles';
export type { Role } from './roles';
export { extractNodes } from './extract';
export type { RawNode } from './extract';
export { normalise } from './normalise';
export * from './buckets';
export {
  parseColor,
  composite,
  luminance,
  contrastRatio,
  effectiveBackground,
  elementContrast,
} from './contrast';
export type { Rgba } from './contrast';
export { baseFontSize, measureStyle, prominenceOf, isVisible } from './styles';
export type { StyleBuckets } from './styles';
export { samplePoints, occlusionFraction, measureOcclusion, isOwnHit } from './occlusion';
