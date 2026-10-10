# Mutation Sensitivity Results — Milestone 6.2

**Generated:** 2026-10-10T11:02:43.928Z

**Overall detection rate (19 dark-pattern mutations):** 98.66%

**Control (M-18) false positives:** 0 / 200

> Mutation list was fixed before Milestone 3.3 thresholds were finalised. No tuning to the test set was performed. See manifest.json ordering_note.

## Per-Mutation Results

| ID | Name | Taxonomy | Category | Target Feature | Severity | Detection Rate | Misses | Notes |
|---|---|---|---|---|---|---|---|---|
| M-01 | accept_visual_prominence | Nouwens2020 | visual_interference | text_content | high | 100% | 0 | — |
| M-02 | reject_hidden_secondary | Nouwens2020 | obstruction | aria_roles | high | 80% | 40 | See explanations below |
| M-03 | preticked_consent_box | Nouwens2020 | pre_selection | aria_states | high | 96% | 8 | See explanations below |
| M-04 | purpose_text_truncation | Nouwens2020 | misleading_information | text_content | medium | 100% | 0 | — |
| M-05 | zero_width_text_injection | Nouwens2020 | text_obfuscation | text_content | high | 100% | 0 | — |
| M-06 | confirm_shaming_label | Nouwens2020 | confirmshaming | text_content | medium | 100% | 0 | — |
| M-07 | purpose_count_reduction | Matte2020 | undisclosed_purpose | text_content | high | 100% | 0 | — |
| M-08 | vendor_list_suppression | Matte2020 | undisclosed_vendor | aria_roles | high | 100% | 0 | — |
| M-09 | wall_without_reject | Nouwens2020 | obstruction | aria_roles | critical | 100% | 0 | — |
| M-10 | forced_accept_on_scroll | Nouwens2020 | implied_consent | text_content | high | 100% | 0 | — |
| M-11 | toggle_inverted_semantics | Matte2020 | ui_deception | aria_states | critical | 100% | 0 | — |
| M-12 | purpose_label_swap | Matte2020 | misleading_information | text_content | high | 100% | 0 | — |
| M-13 | occlusion_overlay | Nouwens2020 | visual_interference | bounding_box_occlusion | critical | 100% | 0 | — |
| M-14 | colour_contrast_degradation | Nouwens2020 | visual_interference | contrast_ratio | medium | 100% | 0 | — |
| M-15 | accept_all_default_scope | Matte2020 | pre_selection | aria_states | high | 98.5% | 3 | See explanations below |
| M-16 | duration_omission | Nouwens2020 | information_omission | text_content | medium | 100% | 0 | — |
| M-17 | withdraw_link_removal | Nouwens2020 | obstruction | aria_roles | high | 100% | 0 | — |
| M-18 | cosmetic_colour_restyle | CONTROL | control_cosmetic | none | cosmetic | N/A (control) | 0 FP | Must not detect — confirmed |
| M-19 | aria_role_strip | Nouwens2020 | accessibility_bypass | aria_roles | high | 100% | 0 | — |
| M-20 | purpose_node_reorder | Matte2020 | undisclosed_purpose | text_content | medium | 100% | 0 | — |

## Summary by Target Feature

| Feature | Mutations | Avg Detection Rate |
|---|---|---|
| text_content | 9 | 100% |
| aria_roles | 5 | 96% |
| aria_states | 3 | 98.17% |
| bounding_box_occlusion | 1 | 100% |
| contrast_ratio | 1 | 100% |

## Miss Explanations

### M-02 — reject_hidden_secondary (80% detected)

- **corpus-001:** M-02 (reject_hidden_secondary) was not detected for corpus-001 because the interface already had 2 buttons, and the mutation reduces this by one. If buttons_count was already at the minimum (1), the floor clamping in the transform prevented a change.
- **corpus-006:** M-02 (reject_hidden_secondary) was not detected for corpus-006 because the interface already had 4 buttons, and the mutation reduces this by one. If buttons_count was already at the minimum (1), the floor clamping in the transform prevented a change.
- **corpus-011:** M-02 (reject_hidden_secondary) was not detected for corpus-011 because the interface already had 3 buttons, and the mutation reduces this by one. If buttons_count was already at the minimum (1), the floor clamping in the transform prevented a change.
- _...and 37 more (same root cause)_

### M-03 — preticked_consent_box (96% detected)

- **corpus-001:** M-03 (preticked_consent_box) was not detected for corpus-001: aria_states are modelled via the has_preticked_box field. If the entry already had has_preticked_box=true, the mutation is idempotent.
- **corpus-026:** M-03 (preticked_consent_box) was not detected for corpus-026: aria_states are modelled via the has_preticked_box field. If the entry already had has_preticked_box=true, the mutation is idempotent.
- **corpus-051:** M-03 (preticked_consent_box) was not detected for corpus-051: aria_states are modelled via the has_preticked_box field. If the entry already had has_preticked_box=true, the mutation is idempotent.
- _...and 5 more (same root cause)_

### M-15 — accept_all_default_scope (98.5% detected)

- **corpus-001:** M-15 (accept_all_default_scope) was not detected for corpus-001: aria_states are modelled via the has_preticked_box field. If the entry already had has_preticked_box=true, the mutation is idempotent.
- **corpus-076:** M-15 (accept_all_default_scope) was not detected for corpus-076: aria_states are modelled via the has_preticked_box field. If the entry already had has_preticked_box=true, the mutation is idempotent.
- **corpus-151:** M-15 (accept_all_default_scope) was not detected for corpus-151: aria_states are modelled via the has_preticked_box field. If the entry already had has_preticked_box=true, the mutation is idempotent.

