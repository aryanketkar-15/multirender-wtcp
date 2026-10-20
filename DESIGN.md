# Design System: Swiss Cryptographic Precision

<!-- impeccable:design-schema 1 -->

## Visual World

**Swiss Cryptographic Precision (Trust & Authority + Technical Minimalism)**
A high-integrity engineering interface designed for legal and security scrutiny. It eschews generic AI-generated purple gradients, floating glassy cards, and frivolous animations in favor of mathematical clarity, crisp hairline grid lines, authoritative typography, and functional color coding.

## Color Palette

- **Canvas / Deep Void:** `#090D16` (Primary dark background, eliminating eye fatigue)
- **Layer 1 Surface (Sidebar / Header):** `#0E1526`
- **Layer 2 Card / Table Row:** `#141D32`
- **Layer 3 Elevated / Modal:** `#1B2642`
- **Hairline Borders:** `rgba(255, 255, 255, 0.08)` (Active/Hover: `rgba(255, 255, 255, 0.16)`)
- **Primary Text:** `#F8FAFC` (High contrast, WCAG AAA 14:1)
- **Secondary / Muted Text:** `#94A3B8` (Readable labels and subtexts, WCAG AA 6.2:1)
- **Brand Accent / Protocol Blue:** `#3B82F6` (Electric cobalt for interactive focal points)
- **Verified Verdict (Cryptographic Green):** `#10B981` (Surface: `rgba(16, 185, 129, 0.12)`, Text: `#34D399`)
- **Tamper / Mismatch (Adversarial Red):** `#EF4444` (Surface: `rgba(239, 68, 68, 0.12)`, Text: `#F87171`)
- **Warning / Nonce Freshness (Amber):** `#F59E0B` (Surface: `rgba(245, 158, 11, 0.12)`, Text: `#FBBF24`)

## Typography

- **System / UI Font:** `Inter`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `Roboto`, `sans-serif`
  - Body: 14px / 1.5line-height, font-weight 400
  - Section Headers: 18px–20px / 1.3line-height, font-weight 600, tracking -0.015em
  - Page Titles: 24px–28px / 1.2line-height, font-weight 700, tracking -0.025em
- **Monospace Cryptographic Font:** `ui-monospace`, `"Fira Code"`, `"JetBrains Mono"`, `"SF Mono"`, `Menlo`, `monospace`
  - Hashes, Hex nonces, Merkle paths, signatures, JSON AST nodes: 12px–13px, font-weight 500, tabular figures.

## Spatial Conventions & Layout

- **Base Unit:** 4px grid. Standard padding: `8px`, `12px`, `16px`, `24px`, `32px`.
- **Containers:** Max width `1200px` for dashboards and comparisons; `640px` for authentication and focus flows.
- **Card Styling:** 1px border `rgba(255, 255, 255, 0.08)`, border-radius `6px` to `8px` (clean chamfered feel, never oversized pill cards).
- **Subtle Depth:** Shadow `0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.24)`.

## Component Conventions

- **Buttons:**
  - Primary: Solid `#2563EB` hover `#1D4ED8`, crisp 6px radius, padding 8px 16px, font-weight 500.
  - Secondary / Outline: Background `transparent`, border `1px solid rgba(255,255,255,0.15)`, hover `rgba(255,255,255,0.06)`.
  - Danger: Surface `rgba(239, 68, 68, 0.15)`, border `1px solid rgba(239, 68, 68, 0.3)`, text `#FCA5A5`.
- **Badges / Verdict Tags:**
  - Pill shape, uppercase tracking +0.05em, font-size 11px, weight 600, with an accompanying status icon.
- **Data Tables & Diffs:**
  - Alternating subtle rows, explicit column headers with bottom border, monospace code blocks with copy action.
- **Interactive Focus:**
  - 2px outline `#3B82F6` with 2px offset for keyboard accessibility (`:focus-visible`).
