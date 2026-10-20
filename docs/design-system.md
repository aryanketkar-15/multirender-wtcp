# MRA Design System Specification

> **Updated 2026-10-20.** The interface is a light theme again (an interim dark theme was replaced as too heavy for an audit product). The values in `client/src/styles/tokens.css` are authoritative; this table is a summary. Contrast was checked by an axe-core audit, not only by calculation (PROJECT_LOG section 26).

**Project:** PS-3 Mutual Render Attestation  
**Module:** Milestone 7.1 — Design System & Custom Assets  
**Group:** TY-A9 · Department of Computer Engineering · VIT Pune  
**Lead Author:** Chetan Agrawal (`chetanagrawal721`)  

---

## 1. Design Philosophy

The Mutual Render Attestation interface is designed as an audit-grade legal and cryptographic dashboard. Its aesthetic priorities are clarity, contrast, structural legibility, and zero external runtime dependencies.

- **Zero Third-Party Trackers & Fonts:** Does not load Google Fonts, Font Awesome, or external CDNs. All typography relies on the user's operating system font stack.
- **Hand-Authored Vector Assets:** All icons, logos, and indicators are hand-coded inline SVGs.
- **Accessibility & Digest Binding:** Under MRA, accessibility is doubly load-bearing: the semantic layout digest is extracted directly from the computed DOM accessibility tree. Accessible semantics guarantee both WCAG AA compliance and cryptographic attestation integrity.

---

## 2. Token Architecture (`client/src/styles/tokens.css`)

### 2.1 Color Palette & Contrast Validation

All text/background combinations meet or exceed WCAG AA standards (minimum contrast 4.5:1 for body copy, 3:1 for large text and UI components).

| Token | Hex / HSL Value | Role | WCAG Contrast Ratio |
|---|---|---|---|
| `--ink` | `hsl(210, 32%, 12%)` (`#14202b`) | Primary body text | 12.1:1 on `--paper` (AAA) |
| `--ink-soft` | `hsl(210, 20%, 36%)` (`#46586a`) | Secondary text, captions | 5.1:1 on `--paper` (AA) |
| `--paper` | `#f5f7fa` | Page background (cool grey; the earlier warm cream was dropped as a default) | — |
| `--card` | `hsl(0, 0%, 100%)` (`#ffffff`) | Card surface background | — |
| `--brand` | `hsl(188, 80%, 23%)` (`#0b5c6b`) | Primary buttons, brand headers | 7.3:1 on `#ffffff` (AAA) |
| `--brand-dark` | `hsl(188, 85%, 17%)` | Hover state for buttons | 9.8:1 on `#ffffff` (AAA) |
| `--brand-soft` | `hsl(188, 40%, 90%)` (`#dcecef`) | Subtle brand highlights, tags | — |
| `--ok` | `hsl(143, 59%, 27%)` (`#1b6b3a`) | Verified status, success badges | 5.9:1 on `#ffffff` (AA) |
| `--ok-soft` | `hsl(143, 50%, 93%)` (`#e4f3ea`) | Success notification background | — |
| `--danger` | `hsl(358, 60%, 40%)` (`#a4262c`) | Attack detected, failure states | 5.6:1 on `#ffffff` (AA) |
| `--danger-soft`| `hsl(358, 80%, 96%)` (`#fbe9ea`) | Failure notification background | — |
| `--warn` | `hsl(36, 90%, 40%)` | Tamper alerts, warnings | 4.8:1 on `#ffffff` (AA) |
| `--line` | `#d8dee6` | Borders, dividers | 1.4:1 (decorative; controls use `--line-strong`) |

### 2.2 Typography Scale

```css
--font: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
--mono: ui-monospace, 'Cascadia Mono', 'Cascadia Code', Consolas, monospace;

--text-xs:   0.75rem;   /* 12px — metadata, status badges */
--text-sm:   0.875rem;  /* 14px — hints, secondary labels */
--text-base: 1.0rem;    /* 16px — standard body copy */
--text-lg:   1.125rem;  /* 18px — card lead, subheads */
--text-xl:   1.375rem;  /* 22px — section titles */
--text-2xl:  1.625rem;  /* 26px — page headings */
--text-3xl:  2.2rem;    /* 35px — hero banner title */
```

### 2.3 Spacing Scale (4-Point Base Grid)

```css
--space-1: 4px;   /* micro-gap between label and hint */
--space-2: 8px;   /* intra-card element spacing */
--space-3: 16px;  /* standard card padding & grid gutter */
--space-4: 24px;  /* large section padding */
--space-5: 40px;  /* hero padding & major section offset */
--space-6: 64px;  /* desktop container margins */
```

### 2.4 Radii & Elevation

```css
--radius-sm: 6px;   /* badges, small buttons, tags */
--radius:    10px;  /* cards, banners, modal hosts */
--radius-lg: 16px;  /* large featured modules */
```

---

## 3. Component Conventions

1. **Buttons (`.btn`, `.btn.secondary`, `.btn-sm`):**
   - Minimum target height: 44px (meets touch target WCAG 2.5.5 requirements).
   - High contrast text (`--brand-ink` on `--brand`).
   - Focus indicator: 3px outline in `--brand` with 2px offset (`:focus-visible`).
2. **Skeleton Loaders (`.skeleton`):**
   - Rendered during asynchronous bundle or pack fetching.
   - Replaces abrupt spinners with smooth content-matching placeholders.
   - Respects `prefers-reduced-motion` by freezing animation to static muted gray.
3. **Empty States (`.empty-state`):**
   - Explains what content will appear once an action is taken.
   - Provides an immediate actionable link or button.
4. **Discrepancy View (`.diff-view`):**
   - Highlights mismatched DOM nodes side-by-side.
   - Color coded: green for client browser attestation, red for server committed bundle.
   - Clear non-technical plain-language summary for legal auditors and examiners.
