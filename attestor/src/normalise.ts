/**
 * Text normalisation: removes cosmetic variation, preserves semantic difference.
 *
 * ORDER (fixed; changing it changes digests, so it is a digest version bump, not an edit):
 *   1. NFKC          compatibility characters decompose first (fullwidth, ligatures, NBSP -> space)
 *   2. strip invisibles  so that characters NFKC exposes or leaves behind are cleaned
 *   3. case fold     so differently cased text compares equal
 *   4. whitespace    runs collapse to one space, then trim
 *
 * Why this order: stripping before NFKC would miss invisibles that only appear after
 * decomposition; folding before NFKC would miss case differences in compatibility characters
 * (a fullwidth capital); collapsing whitespace last catches the spaces produced by steps 1-3.
 *
 * Zero-width stripping is the highest-value rule. Injecting zero-width characters to break
 * naive string matching renders identically, so pixel hashing cannot see it; this does.
 *
 * Known limits, recorded rather than hidden:
 *  - NFKC folds compatibility variants, not cross-script confusables: Cyrillic "a" stays distinct
 *    from Latin "a". A swapped confusable therefore changes the digest, which is the safe direction.
 *  - Stripping ZWJ/ZWNJ also removes them from emoji sequences and some Persian/Indic text.
 *  - Engines ship different Unicode versions, so characters added very recently may normalise
 *    differently across browsers. Measured in the stability study, not assumed.
 */

/**
 * Soft hyphen, combining grapheme joiner, Arabic letter mark, Mongolian vowel separator,
 * zero-width space/non-joiner/joiner, LRM/RLM, bidi embeddings and overrides (202A-202E),
 * word joiner and invisible operators (2060-2064), bidi isolates (2066-2069), BOM / ZWNBSP.
 */
/* eslint-disable no-misleading-character-class -- a deliberate list of single code points */
const INVISIBLES =
  /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

export function normalise(input: string): string {
  const nfkc = input.normalize('NFKC');
  const visible = nfkc.replace(INVISIBLES, '');
  // Upper then lower approximates Unicode full case folding without locale rules:
  // the German sharp s becomes "ss", final and medial sigma agree, and so on.
  const folded = visible.toUpperCase().toLowerCase();
  return folded.replace(/[\s\u0085]+/g, ' ').trim();
}
