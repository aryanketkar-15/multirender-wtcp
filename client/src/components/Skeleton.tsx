/**
 * Skeleton — content placeholder for async loading states.
 *
 * T7.2.2: shown while data is in flight. Skeleton, not a spinner on a
 * blank page. Uses CSS shimmer animation (no GIF, CSS only per T7.1.6).
 * Reduced-motion: shimmer paused, static grey block instead.
 */

interface SkeletonProps {
  /** Height of the block. Default: 20px */
  height?: string | number;
  /** Width. Default: 100% */
  width?: string | number;
  /** Border radius. Default: var(--radius-sm) */
  radius?: string;
  /** Extra class names */
  className?: string;
}

export function Skeleton({ height = 20, width = '100%', radius, className = '' }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        width: typeof width === 'number' ? `${width}px` : width,
        borderRadius: radius ?? 'var(--radius-sm)',
      }}
      aria-hidden="true"
    />
  );
}

/** Pre-composed skeleton for a pack-list card */
export function SkeletonPackCard() {
  return (
    <div className="skeleton-card-wrapper" aria-hidden="true">
      <Skeleton height={80} className="skeleton-card" />
    </div>
  );
}

/** Pre-composed skeleton for a text block (e.g. paragraph lines) */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-text-block" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height={14}
          width={i === lines - 1 ? '65%' : '100%'}
          className="skeleton-text-line"
        />
      ))}
    </div>
  );
}
