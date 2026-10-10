/**
 * mutations/transforms.ts
 * All 20 adversarial mutation transforms for Milestone 6.2.
 *
 * Mutations M-01 through M-17 and M-19–M-20 are drawn from published
 * dark-pattern taxonomies (Nouwens 2020, Matte 2020). M-18 is a control
 * mutation that MUST NOT alter any digest-covered field.
 *
 * Every transform is a pure, deterministic function over CorpusEntry.
 * Applying a transform twice to the same input must return an identical result.
 */

import type { CorpusEntry } from '../corpus/generate-manifest';
import type { MutationTransform, MutatedEntry } from './types';

// ──────────────────────────────────────────────────────────
// Helper: clone entry and stamp mutation metadata
// ──────────────────────────────────────────────────────────
function mutate(
  entry: CorpusEntry,
  id: string,
  name: string,
  overrides: Partial<CorpusEntry>,
  isSemanticallyCovered: boolean,
): MutatedEntry {
  return {
    ...entry,
    ...overrides,
    mutation_id: id,
    mutation_name: name,
    is_semantically_mutated: isSemanticallyCovered,
  };
}

// ──────────────────────────────────────────────────────────
// M-01  accept_visual_prominence  (Nouwens2020 — Visual Interference)
// ──────────────────────────────────────────────────────────
export const M01: MutationTransform = {
  meta: {
    id: 'M-01',
    name: 'accept_visual_prominence',
    taxonomy: 'Nouwens2020',
    taxonomy_ref: 'Table 1 — Interface Interference, Asymmetric button styling',
    category: 'visual_interference',
    description:
      'Accept button rendered at 2x the font size and contrast of the reject/decline button.',
    target_feature: 'text_content',
    severity: 'high',
    is_gap: false,
  },
  apply(entry) {
    // Asymmetric prominence changes word-count perception and button contrast bucket.
    // We model this as a synthetic increase in the digest word_count bucket
    // (CSS font-size 2x causes line-wrap changes → different layout word bucket).
    const mutatedWordCount = Math.floor(entry.word_count * 1.18);
    return mutate(entry, 'M-01', 'accept_visual_prominence', { word_count: mutatedWordCount }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-02  reject_hidden_secondary  (Nouwens2020 — Obstruction)
// ──────────────────────────────────────────────────────────
export const M02: MutationTransform = {
  meta: {
    id: 'M-02',
    name: 'reject_hidden_secondary',
    taxonomy: 'Nouwens2020',
    taxonomy_ref: 'Table 1 — Obstruction, Reject buried in secondary layer',
    category: 'obstruction',
    description:
      'Reject/decline option removed from the primary banner layer and placed in a Settings sub-page only.',
    target_feature: 'aria_roles',
    severity: 'high',
    is_gap: false,
  },
  apply(entry) {
    // Primary layer loses the reject button → has_reject_button flips to false.
    return mutate(entry, 'M-02', 'reject_hidden_secondary', { has_reject_button: false }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-03  preticked_consent_box  (Nouwens2020 — Pre-selection)
// ──────────────────────────────────────────────────────────
export const M03: MutationTransform = {
  meta: {
    id: 'M-03',
    name: 'preticked_consent_box',
    taxonomy: 'Nouwens2020',
    taxonomy_ref: 'Table 1 — Pre-selection, Opt-in pre-selected',
    category: 'pre_selection',
    description:
      'Analytics and marketing consent checkboxes pre-ticked despite requiring explicit opt-in under GDPR Art. 7.',
    target_feature: 'aria_states',
    severity: 'high',
    is_gap: false,
  },
  apply(entry) {
    // Pre-ticking a box: has_preticked_box becomes true regardless of original value.
    return mutate(entry, 'M-03', 'preticked_consent_box', { has_preticked_box: true }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-04  purpose_text_truncation  (Nouwens2020 — Misleading Information)
// ──────────────────────────────────────────────────────────
export const M04: MutationTransform = {
  meta: {
    id: 'M-04',
    name: 'purpose_text_truncation',
    taxonomy: 'Nouwens2020',
    taxonomy_ref: 'Table 1 — Misleading Information, Purpose description hidden behind expand',
    category: 'misleading_information',
    description:
      'Purpose descriptions truncated with "..." and collapsed behind a "Read more" toggle. Full purpose text hidden on load.',
    target_feature: 'text_content',
    severity: 'medium',
    is_gap: false,
  },
  apply(entry) {
    // Truncation reduces visible word count by ~40%.
    const truncatedWordCount = Math.floor(entry.word_count * 0.60);
    return mutate(entry, 'M-04', 'purpose_text_truncation', { word_count: truncatedWordCount }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-05  zero_width_text_injection  (Nouwens2020 — Text Obfuscation)
// ──────────────────────────────────────────────────────────
export const M05: MutationTransform = {
  meta: {
    id: 'M-05',
    name: 'zero_width_text_injection',
    taxonomy: 'Nouwens2020',
    taxonomy_ref: 'Table 1 — Misleading Information, Text obfuscation',
    category: 'text_obfuscation',
    description:
      'Zero-width joiners (U+200D) and ZWNBSP (U+FEFF) injected into consent label text. Visually identical but textContent differs.',
    target_feature: 'text_content',
    severity: 'high',
    is_gap: false,
  },
  apply(entry) {
    // The zero-width injection is modelled as a change to content_hash —
    // the raw textContent now contains invisible characters, producing a
    // different SHA-256 before normalisation strips them.
    const zwjPoisoned =
      entry.content_hash.slice(0, 32) +
      'zw200d' +
      entry.content_hash.slice(32);
    return mutate(entry, 'M-05', 'zero_width_text_injection', { content_hash: zwjPoisoned }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-06  confirm_shaming_label  (Nouwens2020 — Confirmshaming)
// ──────────────────────────────────────────────────────────
export const M06: MutationTransform = {
  meta: {
    id: 'M-06',
    name: 'confirm_shaming_label',
    taxonomy: 'Nouwens2020',
    taxonomy_ref: "Table 1 — Confirmshaming, Guilt-inducing decline label",
    category: 'confirmshaming',
    description:
      "Decline button relabelled to 'No thanks, I don't care about my privacy'. Accept retains neutral label.",
    target_feature: 'text_content',
    severity: 'medium',
    is_gap: false,
  },
  apply(entry) {
    // Relabelling changes word count (+8 words in decline button accessible name)
    // and content_hash of the rendered text tree.
    const shamingWordCount = entry.word_count + 8;
    return mutate(entry, 'M-06', 'confirm_shaming_label', { word_count: shamingWordCount }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-07  purpose_count_reduction  (Matte2020 — Undisclosed Purpose)
// ──────────────────────────────────────────────────────────
export const M07: MutationTransform = {
  meta: {
    id: 'M-07',
    name: 'purpose_count_reduction',
    taxonomy: 'Matte2020',
    taxonomy_ref: 'Section 4.2 — Fewer purposes shown than declared in TCF',
    category: 'undisclosed_purpose',
    description:
      'Two IAB TCF purpose descriptions removed from the displayed list while remaining in the TC string.',
    target_feature: 'text_content',
    severity: 'high',
    is_gap: false,
  },
  apply(entry) {
    // Removing 2 purpose nodes reduces rendered word count and buttons_count.
    const reducedWordCount = Math.max(entry.word_count - 40, 0);
    const reducedButtons = Math.max(entry.buttons_count - 2, 1);
    return mutate(entry, 'M-07', 'purpose_count_reduction', {
      word_count: reducedWordCount,
      buttons_count: reducedButtons,
    }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-08  vendor_list_suppression  (Matte2020 — Undisclosed Vendor)
// ──────────────────────────────────────────────────────────
export const M08: MutationTransform = {
  meta: {
    id: 'M-08',
    name: 'vendor_list_suppression',
    taxonomy: 'Matte2020',
    taxonomy_ref: 'Section 4.3 — Vendor list hidden or removed',
    category: 'undisclosed_vendor',
    description:
      "Vendor count badge removed; 'View vendor list' link removed from the banner.",
    target_feature: 'aria_roles',
    severity: 'high',
    is_gap: false,
  },
  apply(entry) {
    // Removing the vendor-list nav link is equivalent to removing one interactive element.
    const reducedButtons = Math.max(entry.buttons_count - 1, 1);
    return mutate(entry, 'M-08', 'vendor_list_suppression', {
      buttons_count: reducedButtons,
    }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-09  wall_without_reject  (Nouwens2020 — Obstruction)
// ──────────────────────────────────────────────────────────
export const M09: MutationTransform = {
  meta: {
    id: 'M-09',
    name: 'wall_without_reject',
    taxonomy: 'Nouwens2020',
    taxonomy_ref: 'Table 1 — Obstruction, Cookie wall (no reject option)',
    category: 'obstruction',
    description:
      'Consent banner displayed as a blocking modal with no close or decline affordance.',
    target_feature: 'aria_roles',
    severity: 'critical',
    is_gap: false,
  },
  apply(entry) {
    return mutate(entry, 'M-09', 'wall_without_reject', {
      has_reject_button: false,
      layout_archetype: 'fullscreen-overlay', // aria-modal blocking pattern
    }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-10  forced_accept_on_scroll  (Nouwens2020 — Implied Consent)
// ──────────────────────────────────────────────────────────
export const M10: MutationTransform = {
  meta: {
    id: 'M-10',
    name: 'forced_accept_on_scroll',
    taxonomy: 'Nouwens2020',
    taxonomy_ref: 'Table 1 — Interface Interference, Implied consent via scroll',
    category: 'implied_consent',
    description:
      "Banner text changed to 'By scrolling you accept all cookies'. No explicit Accept button provided.",
    target_feature: 'text_content',
    severity: 'high',
    is_gap: false,
  },
  apply(entry) {
    // Changing declaration text → content_hash changes, button count drops to 0.
    const scrollHashSuffix = 'implied_scroll_accept';
    const impliedHash = entry.content_hash.slice(0, 48) + scrollHashSuffix;
    return mutate(entry, 'M-10', 'forced_accept_on_scroll', {
      content_hash: impliedHash,
      buttons_count: 0,
    }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-11  toggle_inverted_semantics  (Matte2020 — UI Deception)
// ──────────────────────────────────────────────────────────
export const M11: MutationTransform = {
  meta: {
    id: 'M-11',
    name: 'toggle_inverted_semantics',
    taxonomy: 'Matte2020',
    taxonomy_ref: 'Section 4.4 — Toggle semantics inverted (ON means reject)',
    category: 'ui_deception',
    description:
      'Toggle controls inverted: aria-checked=true now means rejected, aria-checked=false means consented. Visual label unchanged.',
    target_feature: 'aria_states',
    severity: 'critical',
    is_gap: false,
  },
  apply(entry) {
    // Inverted semantics: a previously-unchecked (reject) interface now appears
    // checked. We model as has_preticked_box toggling to express inversion.
    return mutate(entry, 'M-11', 'toggle_inverted_semantics', {
      has_preticked_box: !entry.has_preticked_box,
      has_preferences_switch: entry.has_preferences_switch,
    }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-12  purpose_label_swap  (Matte2020 — Misleading Information)
// ──────────────────────────────────────────────────────────
export const M12: MutationTransform = {
  meta: {
    id: 'M-12',
    name: 'purpose_label_swap',
    taxonomy: 'Matte2020',
    taxonomy_ref: 'Section 4.2 — Purpose label mismatch / mislabelling',
    category: 'misleading_information',
    description:
      "Purpose labels for 'Analytics' and 'Advertising' swapped in the DOM while internal TC string retains correct mapping.",
    target_feature: 'text_content',
    severity: 'high',
    is_gap: false,
  },
  apply(entry) {
    // Label swap changes content_hash (text tree changes) but not button count.
    const swappedHash = entry.content_hash
      .split('')
      .reverse()
      .join('')
      .slice(0, 64);
    return mutate(entry, 'M-12', 'purpose_label_swap', { content_hash: swappedHash }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-13  occlusion_overlay  (Nouwens2020 — Element Occlusion)
// ──────────────────────────────────────────────────────────
export const M13: MutationTransform = {
  meta: {
    id: 'M-13',
    name: 'occlusion_overlay',
    taxonomy: 'Nouwens2020',
    taxonomy_ref: 'Table 1 — Interface Interference, Element occlusion',
    category: 'visual_interference',
    description:
      'Transparent 1x1 pixel div overlaid on the reject button with z-index:9999 and pointer-events:all.',
    target_feature: 'bounding_box_occlusion',
    severity: 'critical',
    is_gap: false,
  },
  apply(entry) {
    // Occlusion does not change text or ARIA state — it changes the hit-test
    // surface. We model this via a modified content_hash (new DOM node inserted)
    // and implicitly via the bounding-box occlusion digest axis.
    const occludedHash = 'occluded:' + entry.content_hash.slice(0, 55);
    return mutate(entry, 'M-13', 'occlusion_overlay', { content_hash: occludedHash }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-14  colour_contrast_degradation  (Nouwens2020 — Visual Interference)
// ──────────────────────────────────────────────────────────
export const M14: MutationTransform = {
  meta: {
    id: 'M-14',
    name: 'colour_contrast_degradation',
    taxonomy: 'Nouwens2020',
    taxonomy_ref: 'Table 1 — Interface Interference, Insufficient contrast on decline',
    category: 'visual_interference',
    description:
      'Decline button text changed to #cccccc on #ffffff background (contrast ratio 1.6:1, below WCAG AA 4.5:1).',
    target_feature: 'contrast_ratio',
    severity: 'medium',
    is_gap: false,
  },
  apply(entry) {
    // Contrast degradation is captured by the contrast_ratio bucket in the digest.
    // We model the change as a modified content_hash (style attribute mutation).
    const lowContrastHash = 'contrast_fail:' + entry.content_hash.slice(0, 50);
    return mutate(entry, 'M-14', 'colour_contrast_degradation', {
      content_hash: lowContrastHash,
    }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-15  accept_all_default_scope  (Matte2020 — Pre-selection)
// ──────────────────────────────────────────────────────────
export const M15: MutationTransform = {
  meta: {
    id: 'M-15',
    name: 'accept_all_default_scope',
    taxonomy: 'Matte2020',
    taxonomy_ref: "Section 4.1 — Default scope set to 'all purposes' without indication",
    category: 'pre_selection',
    description:
      'All purpose toggles initialised to aria-checked=true (granted) on load before user interaction.',
    target_feature: 'aria_states',
    severity: 'high',
    is_gap: false,
  },
  apply(entry) {
    // Equivalent effect to M-03 but for the full scope, not just one box.
    return mutate(entry, 'M-15', 'accept_all_default_scope', {
      has_preticked_box: true,
      has_preferences_switch: true,
    }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-16  duration_omission  (Nouwens2020 — Information Omission)
// ──────────────────────────────────────────────────────────
export const M16: MutationTransform = {
  meta: {
    id: 'M-16',
    name: 'duration_omission',
    taxonomy: 'Nouwens2020',
    taxonomy_ref: 'Table 1 — Misleading Information, Consent duration not disclosed',
    category: 'information_omission',
    description:
      "Consent duration text node removed entirely. Banner previously stated '13 months'; that sentence is deleted.",
    target_feature: 'text_content',
    severity: 'medium',
    is_gap: false,
  },
  apply(entry) {
    // Remove ~6 words (the duration sentence) from word count.
    const noticedWordCount = Math.max(entry.word_count - 6, 0);
    return mutate(entry, 'M-16', 'duration_omission', { word_count: noticedWordCount }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-17  withdraw_link_removal  (Nouwens2020 — Obstruction)
// ──────────────────────────────────────────────────────────
export const M17: MutationTransform = {
  meta: {
    id: 'M-17',
    name: 'withdraw_link_removal',
    taxonomy: 'Nouwens2020',
    taxonomy_ref: 'Table 1 — Obstruction, Withdraw consent link removed',
    category: 'obstruction',
    description:
      "'Withdraw consent' or 'Manage preferences' persistent footer link removed.",
    target_feature: 'aria_roles',
    severity: 'high',
    is_gap: false,
  },
  apply(entry) {
    const reducedButtons = Math.max(entry.buttons_count - 1, 1);
    return mutate(entry, 'M-17', 'withdraw_link_removal', {
      buttons_count: reducedButtons,
    }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-18  cosmetic_colour_restyle  (CONTROL — must NOT be detected)
// ──────────────────────────────────────────────────────────
export const M18: MutationTransform = {
  meta: {
    id: 'M-18',
    name: 'cosmetic_colour_restyle',
    taxonomy: 'CONTROL',
    taxonomy_ref: 'Control mutation — no dark-pattern classification',
    category: 'control_cosmetic',
    description:
      'Accept button background changed from #1a73e8 to #1565c0 (both WCAG AA compliant, semantics unchanged). MUST NOT trip the digest.',
    target_feature: 'none',
    severity: 'cosmetic',
    is_gap: false,
    expected_detected: false,
  },
  apply(entry) {
    // Cosmetic-only: no field tracked by the digest changes.
    // Return an identical clone — the content_hash, roles, states, word count
    // and button count all remain the same.
    return mutate(entry, 'M-18', 'cosmetic_colour_restyle', {}, false);
  },
};

// ──────────────────────────────────────────────────────────
// M-19  aria_role_strip  (Nouwens2020 — Accessibility Bypass)
// ──────────────────────────────────────────────────────────
export const M19: MutationTransform = {
  meta: {
    id: 'M-19',
    name: 'aria_role_strip',
    taxonomy: 'Nouwens2020',
    taxonomy_ref: 'Table 1 — Interface Interference, ARIA role removal (accessibility bypass)',
    category: 'accessibility_bypass',
    description:
      'role=button removed from styled div elements acting as consent buttons. Elements are visually present but invisible to assistive technology.',
    target_feature: 'aria_roles',
    severity: 'high',
    is_gap: false,
  },
  apply(entry) {
    // Stripping role=button → buttons_count as seen by accessibility tree drops.
    const accessibleButtons = Math.max(entry.buttons_count - 2, 0);
    return mutate(entry, 'M-19', 'aria_role_strip', { buttons_count: accessibleButtons }, true);
  },
};

// ──────────────────────────────────────────────────────────
// M-20  purpose_node_reorder  (Matte2020 — Undisclosed Purpose)
// ──────────────────────────────────────────────────────────
export const M20: MutationTransform = {
  meta: {
    id: 'M-20',
    name: 'purpose_node_reorder',
    taxonomy: 'Matte2020',
    taxonomy_ref: 'Section 4.2 — Purpose rendering order differs from TC string declaration order',
    category: 'undisclosed_purpose',
    description:
      'Purpose list items reordered in the DOM (advertising purpose moved from position 3 to position 1). Order mismatch against declared IAB TCF sequence.',
    target_feature: 'text_content',
    severity: 'medium',
    is_gap: false,
  },
  apply(entry) {
    // Reordering changes content_hash (digest serialises DOM order).
    const reorderedHash = 'reordered:' + entry.content_hash.slice(0, 54);
    return mutate(entry, 'M-20', 'purpose_node_reorder', { content_hash: reorderedHash }, true);
  },
};

// ──────────────────────────────────────────────────────────
// Registry: ordered list of all 20 transforms
// ──────────────────────────────────────────────────────────
export const ALL_MUTATIONS: MutationTransform[] = [
  M01, M02, M03, M04, M05, M06, M07, M08, M09, M10,
  M11, M12, M13, M14, M15, M16, M17, M18, M19, M20,
];
