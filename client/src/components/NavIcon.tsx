/**
 * Navigation icons, drawn as simple inline SVG strokes. Decorative: every use sits next to a text
 * label (or an accessible name on the control), so the icons are hidden from assistive technology.
 */
export type NavIconName =
  | 'home'
  | 'consent'
  | 'packs'
  | 'verifier'
  | 'admin'
  | 'sign-in'
  | 'register'
  | 'sign-out'
  | 'menu'
  | 'collapse'
  | 'expand'
  | 'close';

const PATHS: Record<NavIconName, string> = {
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  consent: 'M6 3h9l4 4v14H6zM15 3v4h4M9 14l2 2 4-4',
  packs: 'M3 7l2-3h14l2 3M3 7h18v13H3zM9 12h6',
  verifier: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5',
  admin: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  'sign-in': 'M14 4h5v16h-5M10 8l4 4-4 4M14 12H4',
  register: 'M15 8a4 4 0 11-8 0 4 4 0 018 0zM3 20c0-4 3-6 7-6s7 2 7 6M19 8v6M16 11h6',
  'sign-out': 'M10 4H5v16h5M14 8l4 4-4 4M18 12H8',
  menu: 'M4 7h16M4 12h16M4 17h16',
  collapse: 'M14 6l-6 6 6 6M19 5v14',
  expand: 'M10 6l6 6-6 6M5 5v14',
  close: 'M6 6l12 12M18 6L6 18',
};

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      className="nav-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
