# Assets Provenance Register

**Project:** PS-3 Mutual Render Attestation (MRA)  
**Group:** TY-A9, Department of Computer Engineering, VIT Pune  
**Course:** Web Technologies · Prof. Rahul Diwate  

Per Milestone 7.1, **no ready-made GIFs, stock photographs, external icons or downloaded logos are used**. Every visual asset in the application is original, hand-authored, and committed directly in source form.

## Visual Assets and Icons

| Asset | File Location | Format | Author / Origin | Licence | Description |
|---|---|---|---|---|---|
| MRA Brand Mark (Component) | `client/src/components/Logo.tsx` | TSX / Inline SVG | Chetan Agrawal (TY-A9) | MIT / Project Original | Hand-authored SVG paths: rounded card contour, dual document layers, and verification checkmark. |
| MRA Brand Logo | `client/src/assets/logo.svg` | SVG | Chetan Agrawal (TY-A9) | MIT / Project Original | Standalone SVG vector version of the MRA logo mark. |
| Alert Triangle Icon | `client/src/assets/icons/alert-triangle.svg` | SVG | Chetan Agrawal (TY-A9) | MIT / Project Original | Hand-drawn equilateral warning triangle with rounded apex and central exclamation mark. |
| Check Circle Icon | `client/src/assets/icons/check-circle.svg` | SVG | Chetan Agrawal (TY-A9) | MIT / Project Original | Hand-drawn success circle enclosing an acute checkmark. |
| Evidence Pack Icon | `client/src/assets/icons/file-pack.svg` | SVG | Chetan Agrawal (TY-A9) | MIT / Project Original | Hand-drawn document outline with folded corner and package zip horizontal lines. |
| Refresh / Retry Icon | `client/src/assets/icons/refresh.svg` | SVG | Chetan Agrawal (TY-A9) | MIT / Project Original | Hand-drawn circular dual-arc reload arrows. |
| Shield Check Icon | `client/src/assets/icons/shield-check.svg` | SVG | Chetan Agrawal (TY-A9) | MIT / Project Original | Hand-drawn security shield enclosing an authentic checkmark. |
| Upload Icon | `client/src/assets/icons/upload.svg` | SVG | Chetan Agrawal (TY-A9) | MIT / Project Original | Hand-drawn upload tray with centered vertical arrow. |
| Empty State Document Illustration | `client/src/pages/MyPacks.tsx`, `client/src/components/EmptyState.tsx` | Inline SVG | Chetan Agrawal (TY-A9) | MIT / Project Original | Minimalist SVG document silhouette with horizontal text lines. |

## Animation and Motion

| Element | Location | Implementation | Notes |
|---|---|---|---|
| Loading Spinner | `client/src/styles.css` (`.spinner`) | Pure CSS (`border-radius: 50%`, `animation: spin 0.8s linear infinite`) | Zero raster GIFs used. Slows to 3s when `prefers-reduced-motion: reduce` is active. |
| Skeleton Shimmer | `client/src/styles.css` (`.skeleton`) | Pure CSS (`linear-gradient`, `background-position` shimmer) | Zero external assets. Replaces spinner on blank page loads. Pauses to static gray when `prefers-reduced-motion: reduce` is active. |

## Typography and Design Tokens

| Token System | Location | Source |
|---|---|---|
| System Font Stack | `client/src/styles/tokens.css` (`--font`) | Native OS stack: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`. Zero external web font downloads (no Google Fonts, Typekit, etc.), zero tracking, zero licensing constraints. |
| Monospace Stack | `client/src/styles/tokens.css` (`--mono`) | Native monospace: `ui-monospace, 'Cascadia Mono', Consolas, monospace` for cryptographic hashes and diff elements. |
| Spacing & Sizing Scale | `client/src/styles/tokens.css` | 4-point base scale (`4px, 8px, 16px, 24px, 40px, 64px`). |
| Color Palette | `client/src/styles/tokens.css` | Original teal/slate scheme (`--brand: hsl(188, 80%, 23%)`, `--ink: hsl(210, 32%, 12%)`, `--paper: hsl(43, 20%, 95%)`). All body and label pairs strictly meet WCAG AA contrast (≥ 4.5:1). |
