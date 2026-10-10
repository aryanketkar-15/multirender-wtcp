/**
 * tests/sensitivity.test.ts
 * Milestone 6.2 — Mutation suite test cases T6.2.1 through T6.2.9
 *
 * Tests verify:
 *   T6.2.1  All 20 mutations are implemented and execute
 *   T6.2.2  Mutations are deterministic (apply twice = same output)
 *   T6.2.3  Text-content mutations detected (100%)
 *   T6.2.4  State (aria_states) mutations detected (100%)
 *   T6.2.5  Style/visual mutations: rate recorded per mutation
 *   T6.2.6  Occlusion mutations: rate recorded
 *   T6.2.7  Zero-width injection detected via normalisation
 *   T6.2.8  Every miss has a written explanation
 *   T6.2.9  Cosmetic control (M-18) does NOT trip the digest
 */

import { ALL_MUTATIONS, M18 } from '../mutations/transforms';
import { computeInterfaceDigest } from '../harness/stability';
import { VIEWPORTS } from '../harness/matrix';
import { runSensitivityHarness } from '../harness/sensitivity';
import type { CorpusEntry, CorpusManifest } from '../corpus/generate-manifest';

// ──────────────────────────────────────────────────────────
// Minimal corpus fixture (10 interfaces covering edge cases)
// ──────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<CorpusEntry> & { id: string }): CorpusEntry {
  return {
    name: `Test Interface ${overrides.id}`,
    domain: 'test.example.com',
    url: `https://test.example.com/${overrides.id}`,
    cmp_family: 'OneTrust / CookiePro',
    sector: 'E-Commerce & Retail',
    capture_date: '2026-10-10',
    region_selector: '#cookie-banner',
    layout_archetype: 'modal-center',
    breakpoints: [768, 1024],
    buttons_count: 3,
    has_reject_button: true,
    has_preferences_switch: true,
    has_preticked_box: false,
    word_count: 150,
    content_hash: 'sha256:abc123def456abc123def456abc123def456abc123def456abc123def456ab12',
    provenance: { status: 200, archive_id: 'test-arc-001', har_size_bytes: 50000 },
    ...overrides,
  };
}

const FIXTURE_ENTRIES: CorpusEntry[] = [
  makeEntry({ id: 'corpus-001', word_count: 200, buttons_count: 4, has_reject_button: true, has_preticked_box: false }),
  makeEntry({ id: 'corpus-002', word_count: 80, buttons_count: 2, has_reject_button: false }),
  makeEntry({ id: 'corpus-003', word_count: 300, buttons_count: 5, has_preticked_box: true }),
  makeEntry({ id: 'corpus-042', word_count: 150, buttons_count: 3 }),
  makeEntry({ id: 'corpus-100', word_count: 50, buttons_count: 1, has_reject_button: true }),
  makeEntry({ id: 'corpus-101', word_count: 250, buttons_count: 6, has_preferences_switch: true }),
  makeEntry({ id: 'corpus-137', word_count: 120, buttons_count: 3, has_preticked_box: false }),
  makeEntry({ id: 'corpus-150', word_count: 10, buttons_count: 2, has_reject_button: false }),
  makeEntry({ id: 'corpus-180', word_count: 400, buttons_count: 8, has_preticked_box: true }),
  makeEntry({ id: 'corpus-199', word_count: 75, buttons_count: 2 }),
];

const FIXTURE_MANIFEST: CorpusManifest = {
  schema_version: '1.0',
  generated_at: '2026-10-10T10:00:00Z',
  total_interfaces: FIXTURE_ENTRIES.length,
  sectors_covered: ['E-Commerce & Retail'],
  cmp_families_covered: ['OneTrust / CookiePro'],
  interfaces: FIXTURE_ENTRIES,
};

const BASELINE_VIEWPORT = VIEWPORTS.find((v) => v.name === '1280x800')!;
const BASELINE_BROWSER = 'chromium' as const;
const BASELINE_DPR = 1 as const;
const BASELINE_FONT = 'standard' as const;

// ──────────────────────────────────────────────────────────
// T6.2.1  All 20 mutations are implemented and execute
// ──────────────────────────────────────────────────────────

describe('T6.2.1 — All 20 mutations implemented', () => {
  test('exactly 20 transforms are registered', () => {
    expect(ALL_MUTATIONS).toHaveLength(20);
  });

  test('each transform has a unique ID', () => {
    const ids = ALL_MUTATIONS.map((m) => m.meta.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(20);
  });

  test('all transforms execute without throwing on every fixture entry', () => {
    for (const mutation of ALL_MUTATIONS) {
      for (const entry of FIXTURE_ENTRIES) {
        expect(() => mutation.apply(entry)).not.toThrow();
      }
    }
  });

  test('each mutation has a taxonomy reference', () => {
    for (const mutation of ALL_MUTATIONS) {
      expect(mutation.meta.taxonomy_ref).toBeTruthy();
      expect(mutation.meta.taxonomy_ref.length).toBeGreaterThan(10);
    }
  });

  test('each mutation has a non-empty description', () => {
    for (const mutation of ALL_MUTATIONS) {
      expect(mutation.meta.description.length).toBeGreaterThan(20);
    }
  });
});

// ──────────────────────────────────────────────────────────
// T6.2.2  Mutations are deterministic
// ──────────────────────────────────────────────────────────

describe('T6.2.2 — Mutation determinism', () => {
  test('applying a mutation twice produces identical output', () => {
    for (const mutation of ALL_MUTATIONS) {
      const entry = FIXTURE_ENTRIES[0];
      const result1 = mutation.apply(entry);
      const result2 = mutation.apply(entry);
      expect(result1).toEqual(result2);
    }
  });

  test('applying mutation to different entries produces potentially different outputs', () => {
    // At least one mutation must distinguish between entries
    const mutation = ALL_MUTATIONS[0]; // M-01 word_count * 1.18
    const results = FIXTURE_ENTRIES.map((e) => mutation.apply(e).word_count);
    // Not all results should be identical (different word counts → different mutations)
    const uniqueResults = new Set(results);
    expect(uniqueResults.size).toBeGreaterThan(1);
  });
});

// ──────────────────────────────────────────────────────────
// T6.2.3  Text-content mutations detected
// ──────────────────────────────────────────────────────────

describe('T6.2.3 — Text-content mutations detected', () => {
  const textMutations = ALL_MUTATIONS.filter(
    (m) => m.meta.target_feature === 'text_content' && !m.meta.is_gap,
  );

  test('text-content mutations exist in the suite', () => {
    expect(textMutations.length).toBeGreaterThanOrEqual(5);
  });

  test('each text-content mutation changes the digest for at least one fixture entry', () => {
    for (const mutation of textMutations) {
      let anyDetected = false;
      for (const entry of FIXTURE_ENTRIES) {
        const { digest: orig } = computeInterfaceDigest(entry, BASELINE_BROWSER, BASELINE_VIEWPORT, BASELINE_DPR, BASELINE_FONT);
        const mutated = mutation.apply(entry);
        const { digest: mut } = computeInterfaceDigest(mutated, BASELINE_BROWSER, BASELINE_VIEWPORT, BASELINE_DPR, BASELINE_FONT);
        if (orig !== mut) {
          anyDetected = true;
          break;
        }
      }
      expect(anyDetected).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────
// T6.2.4  Aria-state mutations detected
// ──────────────────────────────────────────────────────────

describe('T6.2.4 — Aria-state mutations detected', () => {
  const stateMutations = ALL_MUTATIONS.filter(
    (m) => m.meta.target_feature === 'aria_states' && !m.meta.is_gap,
  );

  test('aria_states mutations exist in the suite', () => {
    expect(stateMutations.length).toBeGreaterThanOrEqual(2);
  });

  test('each aria_states mutation changes the digest for at least one fixture entry', () => {
    // Build a fixture entry where has_preticked_box is false so flipping it changes digest
    const eligibleEntries = FIXTURE_ENTRIES.filter((e) => !e.has_preticked_box);
    expect(eligibleEntries.length).toBeGreaterThan(0);

    for (const mutation of stateMutations) {
      let anyDetected = false;
      for (const entry of eligibleEntries) {
        const { digest: orig } = computeInterfaceDigest(entry, BASELINE_BROWSER, BASELINE_VIEWPORT, BASELINE_DPR, BASELINE_FONT);
        const mutated = mutation.apply(entry);
        const { digest: mut } = computeInterfaceDigest(mutated, BASELINE_BROWSER, BASELINE_VIEWPORT, BASELINE_DPR, BASELINE_FONT);
        if (orig !== mut) {
          anyDetected = true;
          break;
        }
      }
      expect(anyDetected).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────
// T6.2.5  Style/visual mutations — rate recorded
// ──────────────────────────────────────────────────────────

describe('T6.2.5 — Visual-interference mutations have recorded detection rates', () => {
  test('running full sensitivity harness produces per-mutation records for visual mutations', () => {
    const report = runSensitivityHarness(FIXTURE_MANIFEST);
    const visualResults = report.per_mutation.filter(
      (r) => r.category === 'visual_interference' && !r.is_control,
    );
    expect(visualResults.length).toBeGreaterThanOrEqual(2);
    for (const result of visualResults) {
      // Rate must be a valid percentage
      expect(result.detection_rate_pct).toBeGreaterThanOrEqual(0);
      expect(result.detection_rate_pct).toBeLessThanOrEqual(100);
      // interfaces_tested must be > 0
      expect(result.interfaces_tested).toBeGreaterThan(0);
    }
  });
});

// ──────────────────────────────────────────────────────────
// T6.2.6  Occlusion mutations — rate recorded
// ──────────────────────────────────────────────────────────

describe('T6.2.6 — Occlusion mutations have recorded detection rates', () => {
  test('M-13 occlusion result is present in the sensitivity report', () => {
    const report = runSensitivityHarness(FIXTURE_MANIFEST);
    const m13 = report.per_mutation.find((r) => r.mutation_id === 'M-13');
    expect(m13).toBeDefined();
    expect(m13!.target_feature).toBe('bounding_box_occlusion');
    expect(m13!.detection_rate_pct).toBeGreaterThanOrEqual(0);
    expect(m13!.detection_rate_pct).toBeLessThanOrEqual(100);
  });
});

// ──────────────────────────────────────────────────────────
// T6.2.7  Zero-width injection detected
// ──────────────────────────────────────────────────────────

describe('T6.2.7 — Zero-width injection detected', () => {
  test('M-05 changes content_hash (raw textContent differs before normalisation)', () => {
    const entry = FIXTURE_ENTRIES[0];
    const m05 = ALL_MUTATIONS.find((m) => m.meta.id === 'M-05')!;
    const mutated = m05.apply(entry);

    // The content_hash should be different (poisoned with ZWJ marker)
    expect(mutated.content_hash).not.toBe(entry.content_hash);
    expect(mutated.content_hash).toContain('zw200d');
  });

  test('M-05 digest diverges from original', () => {
    const entry = FIXTURE_ENTRIES[0];
    const m05 = ALL_MUTATIONS.find((m) => m.meta.id === 'M-05')!;
    const mutated = m05.apply(entry);

    const { digest: origDigest } = computeInterfaceDigest(entry, BASELINE_BROWSER, BASELINE_VIEWPORT, BASELINE_DPR, BASELINE_FONT);
    const { digest: mutDigest } = computeInterfaceDigest(mutated, BASELINE_BROWSER, BASELINE_VIEWPORT, BASELINE_DPR, BASELINE_FONT);

    expect(origDigest).not.toBe(mutDigest);
  });
});

// ──────────────────────────────────────────────────────────
// T6.2.8  Every miss has a written explanation
// ──────────────────────────────────────────────────────────

describe('T6.2.8 — Every miss has a written explanation', () => {
  test('all miss records in the sensitivity report have non-empty explanations', () => {
    const report = runSensitivityHarness(FIXTURE_MANIFEST);
    for (const result of report.per_mutation) {
      if (result.is_control) continue;
      for (const miss of result.miss_explanations) {
        expect(miss.explanation).toBeTruthy();
        expect(miss.explanation.length).toBeGreaterThan(30);
      }
    }
  });

  test('miss_explanations count matches miss_details count', () => {
    const report = runSensitivityHarness(FIXTURE_MANIFEST);
    for (const result of report.per_mutation) {
      if (result.is_control) continue;
      // Every miss detail should have a corresponding explanation
      const undetectedDetails = result.miss_details.filter((d) => !d.was_detected);
      expect(undetectedDetails.length).toBe(result.miss_explanations.length);
    }
  });
});

// ──────────────────────────────────────────────────────────
// T6.2.9  Cosmetic control (M-18) must NOT trip the digest
// ──────────────────────────────────────────────────────────

describe('T6.2.9 — Cosmetic control M-18 does not trip the digest', () => {
  test('M-18 does not change any CorpusEntry field tracked by the digest', () => {
    for (const entry of FIXTURE_ENTRIES) {
      const mutated = M18.apply(entry);

      // All digest-covered fields must be identical
      expect(mutated.content_hash).toBe(entry.content_hash);
      expect(mutated.buttons_count).toBe(entry.buttons_count);
      expect(mutated.has_reject_button).toBe(entry.has_reject_button);
      expect(mutated.has_preferences_switch).toBe(entry.has_preferences_switch);
      expect(mutated.has_preticked_box).toBe(entry.has_preticked_box);
      expect(mutated.word_count).toBe(entry.word_count);
      expect(mutated.layout_archetype).toBe(entry.layout_archetype);
    }
  });

  test('M-18 produces identical digest for every fixture entry', () => {
    for (const entry of FIXTURE_ENTRIES) {
      const { digest: orig } = computeInterfaceDigest(entry, BASELINE_BROWSER, BASELINE_VIEWPORT, BASELINE_DPR, BASELINE_FONT);
      const mutated = M18.apply(entry);
      const { digest: mut } = computeInterfaceDigest(mutated, BASELINE_BROWSER, BASELINE_VIEWPORT, BASELINE_DPR, BASELINE_FONT);
      expect(orig).toBe(mut);
    }
  });

  test('M-18 has zero false positives in the full sensitivity report', () => {
    const report = runSensitivityHarness(FIXTURE_MANIFEST);
    expect(report.control_false_positives).toBe(0);
    expect(report.control_mutation_id).toBe('M-18');
  });

  test('M-18 expected_detected is false in metadata', () => {
    const meta = M18.meta;
    expect(meta.expected_detected).toBe(false);
    expect(meta.target_feature).toBe('none');
  });
});

// ──────────────────────────────────────────────────────────
// Additional integration tests
// ──────────────────────────────────────────────────────────

describe('Integration — full sensitivity report structure', () => {
  let report: ReturnType<typeof runSensitivityHarness>;

  beforeAll(() => {
    report = runSensitivityHarness(FIXTURE_MANIFEST);
  });

  test('report has 20 per_mutation records', () => {
    expect(report.per_mutation).toHaveLength(20);
  });

  test('report has exactly 1 control mutation', () => {
    const controls = report.per_mutation.filter((r) => r.is_control);
    expect(controls).toHaveLength(1);
    expect(controls[0].mutation_id).toBe('M-18');
  });

  test('report has 19 dark-pattern mutations', () => {
    expect(report.dark_pattern_mutations).toBe(19);
  });

  test('overall_detection_rate_pct is between 0 and 100', () => {
    expect(report.overall_detection_rate_pct).toBeGreaterThanOrEqual(0);
    expect(report.overall_detection_rate_pct).toBeLessThanOrEqual(100);
  });

  test('by_feature aggregation covers all non-control features', () => {
    const featuresInReport = Object.keys(report.by_feature);
    expect(featuresInReport.length).toBeGreaterThan(0);
    // 'none' (cosmetic control) should NOT appear in by_feature (control excluded)
    expect(featuresInReport).not.toContain('none');
  });

  test('known_gaps list is empty (no is_gap mutations in this suite)', () => {
    expect(report.known_gaps).toHaveLength(0);
  });

  test('all mutation taxonomy refs are non-empty', () => {
    for (const result of report.per_mutation) {
      expect(result.taxonomy_ref.length).toBeGreaterThan(10);
    }
  });

  test('ordering_note is present and mentions threshold ordering', () => {
    expect(report.ordering_note).toContain('Milestone 3.3');
    expect(report.ordering_note).toContain('tuning');
  });
});
