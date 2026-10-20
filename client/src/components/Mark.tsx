/**
 * Small status marks drawn as inline SVG, used instead of text glyphs (a tick or a cross typed as a
 * character renders differently on every platform and is read out inconsistently).
 */
export type MarkKind = 'pass' | 'fail' | 'pending';

const LABEL: Record<MarkKind, string> = { pass: 'Passed', fail: 'Failed', pending: 'Pending' };

export function Mark({ kind, label }: { kind: MarkKind; label?: string }) {
  return (
    <svg
      className={`mark mark-${kind}`}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      role="img"
      aria-label={label ?? LABEL[kind]}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'pass' && <path d="M3 8.5l3.2 3.2L13 4.8" />}
      {kind === 'fail' && <path d="M4 4l8 8M12 4l-8 8" />}
      {kind === 'pending' && <path d="M4 8h8" />}
    </svg>
  );
}
