/** Hand-coded mark: two mirrored page corners meeting at a check. No stock imagery. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="MRA mark"
      focusable="false"
    >
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--brand)" />
      <path
        d="M8 22V10h7M24 10v12h-7"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M12.5 16.5l3.2 3.2 5-6"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
