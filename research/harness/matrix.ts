import type { CorpusEntry } from '../corpus/generate-manifest';

export type BrowserEngine = 'chromium' | 'firefox' | 'webkit' | 'edge';

export interface ViewportConfig {
  name: string;
  width: number;
  height: number;
  category: 'mobile-narrow' | 'mobile-wide' | 'tablet' | 'desktop-laptop' | 'desktop-wide';
}

export type DprValue = 1 | 2 | 3;
export type FontCondition = 'standard' | 'fallback';

export const BROWSERS: BrowserEngine[] = ['chromium', 'firefox', 'webkit', 'edge'];

export const VIEWPORTS: ViewportConfig[] = [
  { name: '375x667', width: 375, height: 667, category: 'mobile-narrow' },
  { name: '414x896', width: 414, height: 896, category: 'mobile-wide' },
  { name: '768x1024', width: 768, height: 1024, category: 'tablet' },
  { name: '1280x800', width: 1280, height: 800, category: 'desktop-laptop' }, // Baseline
  { name: '1920x1080', width: 1920, height: 1080, category: 'desktop-wide' },
];

export const DPRS: DprValue[] = [1, 2, 3];
export const FONT_CONDITIONS: FontCondition[] = ['standard', 'fallback'];

export const CAUSE_CODES = {
  NONE: 'NONE', // Digests match
  BREAKPOINT_RELAYOUT: 'BREAKPOINT_RELAYOUT', // Responsive media query triggered re-layout
  FONT_METRIC_DRIFT: 'FONT_METRIC_DRIFT', // Fallback font metrics altered wrapping/height
  DPR_SUBPIXEL_ROUNDING: 'DPR_SUBPIXEL_ROUNDING', // Fractional subpixel rounding at 2x/3x
  BROWSER_DEFAULT_STYLES: 'BROWSER_DEFAULT_STYLES', // User agent default styling divergence
  COLOR_SCHEME_FORCED: 'COLOR_SCHEME_FORCED', // High contrast / forced colors active
  OCCLUSION_DIFFERENCE: 'OCCLUSION_DIFFERENCE', // Stacking context evaluation discrepancy
  RENDER_FAILURE: 'RENDER_FAILURE', // Explicit execution failure
} as const;

export type CauseCode = (typeof CAUSE_CODES)[keyof typeof CAUSE_CODES];

export interface MatrixCell {
  interface_id: string;
  browser: BrowserEngine;
  viewport: string;
  viewport_width: number;
  viewport_height: number;
  dpr: DprValue;
  font: FontCondition;
  digest: string;
  agrees_with_baseline: boolean;
  is_breakpoint_transition: boolean;
  cause_code: CauseCode;
  error?: string;
}

export interface BreakpointAnalysis {
  interface_id: string;
  breakpoints: number[];
  desktop_digest: string;
  mobile_digest: string;
  tablet_digest: string;
  desktop_mobile_agree: boolean;
  desktop_tablet_agree: boolean;
  tablet_mobile_agree: boolean;
  cause: CauseCode;
}

export interface StabilitySummary {
  timestamp: string;
  total_interfaces: number;
  total_evaluations: number; // 200 * 4 * 5 * 3 * 2 = 24,000
  render_failures: number;

  // Environment Variation (Within-Breakpoint / Matched Viewport Class)
  matched_env_evaluations: number;
  matched_env_agreements: number;
  matched_env_agreement_rate_pct: number;

  // Breakpoint / Cross-Viewport Variation (Third Axis, reported separately)
  cross_viewport_evaluations: number;
  cross_viewport_agreements: number;
  cross_viewport_agreement_rate_pct: number;

  // Axis-specific Agreement Rates
  cross_browser_agreement_rate_pct: number;
  cross_dpr_agreement_rate_pct: number;
  font_fallback_agreement_rate_pct: number;

  // Overall Global Matrix Agreement (all 24,000 cells against 1280x800@1x Chrome baseline)
  global_matrix_agreement_rate_pct: number;

  // Disagreements Classification
  disagreements_count: number;
  disagreements_by_cause: Record<CauseCode, number>;

  // Per-Browser Statistics
  by_browser: Record<
    BrowserEngine,
    {
      evaluations: number;
      agreements: number;
      agreement_rate_pct: number;
    }
  >;
}
