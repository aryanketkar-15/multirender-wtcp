# Sensitivity to adversarial mutations (milestone 6.2, real rendering)

Generated 2026-10-15T05:08:02.893Z. chromium 153.0.8010.12, 1280x800 @1x, default fonts. Corpus: synthetic, 200 pages (research/corpus/pages.cjs). A mutation is applied to the real DOM after load; "detected" means a real digest changed. Mutations a page has nothing to change are counted as not applicable, never as misses.

| ID | Mutation | Source | Applicable | Detected (region) | Detected (context only) | Undetected | Rate (region) | Rate (any digest) | Determinism (20 pages) | Caught by |
|---|---|---|---|---|---|---|---|---|---|---|
| M-01 | accept_visual_prominence | Nouwens2020 | 200 | 200 | 0 | 0 | 100.0% | 100.0% | 20/20 | STYLE_SIZE 189, OCCLUSION 11 |
| M-02 | reject_removed_from_first_layer | Nouwens2020 | 175 | 175 | 0 | 0 | 100.0% | 100.0% | 20/20 | STRUCTURE 175 |
| M-03 | preticked_purposes | Nouwens2020 | 123 | 123 | 0 | 0 | 100.0% | 100.0% | 20/20 | STATE 123 |
| M-04 | purpose_text_truncated | Matte2020 | 200 | 200 | 0 | 0 | 100.0% | 100.0% | 20/20 | TEXT 191, OCCLUSION 9 |
| M-05 | zero_width_text_injection | Matte2020 | 200 | 0 | 0 | 200 | 0.0% | 0.0% | 20/20 | - |
| M-06 | confirmshaming_label | Brignull | 175 | 175 | 0 | 0 | 100.0% | 100.0% | 20/20 | STYLE_PROMINENCE 146, OCCLUSION 5, TEXT 24 |
| M-07 | purposes_removed | Matte2020 | 166 | 166 | 0 | 0 | 100.0% | 100.0% | 20/20 | STRUCTURE 166 |
| M-08 | vendor_list_suppressed | Matte2020 | 139 | 139 | 0 | 0 | 100.0% | 100.0% | 20/20 | STRUCTURE 139 |
| M-09 | wall_without_reject | Nouwens2020 | 200 | 200 | 0 | 0 | 100.0% | 100.0% | 20/20 | STRUCTURE 200 |
| M-10 | implied_consent_text | Matte2020 | 200 | 200 | 0 | 0 | 100.0% | 100.0% | 20/20 | STRUCTURE 200 |
| M-11 | switch_semantics_inverted | Nouwens2020 | 69 | 69 | 0 | 0 | 100.0% | 100.0% | 20/20 | STATE 69 |
| M-12 | purpose_labels_swapped | Matte2020 | 166 | 166 | 0 | 0 | 100.0% | 100.0% | 20/20 | TEXT 166 |
| M-13 | transparent_overlay_on_reject | Nouwens2020 | 175 | 164 | 0 | 11 | 93.7% | 93.7% | 20/20 | OCCLUSION 164 |
| M-14 | reject_contrast_degraded | Nouwens2020 | 175 | 175 | 0 | 0 | 100.0% | 100.0% | 20/20 | STYLE_CONTRAST 175 |
| M-15 | granular_choice_removed | Nouwens2020 | 166 | 166 | 0 | 0 | 100.0% | 100.0% | 20/20 | STYLE_SIZE 97, STRUCTURE 69 |
| M-16 | duration_omitted | Matte2020 | 152 | 152 | 0 | 0 | 100.0% | 100.0% | 20/20 | STRUCTURE 152 |
| M-17 | withdraw_link_removed | Nouwens2020 | 167 | 0 | 167 | 0 | 0.0% | 100.0% | 20/20 | context:STRUCTURE 167 |
| M-18 | cosmetic_restyle | CONTROL | 200 | 0 | 0 | 200 | 0.0% | 0.0% | 20/20 | - |
| M-19 | button_role_stripped | Matte2020 | 50 | 50 | 0 | 0 | 100.0% | 100.0% | 20/20 | STYLE_PROMINENCE 49, OCCLUSION 1 |
| M-20 | purposes_reordered | Matte2020 | 166 | 166 | 0 | 0 | 100.0% | 100.0% | 20/20 | TEXT 166 |
