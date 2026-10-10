import fs from 'node:fs';
import path from 'node:path';
import { runStabilityMatrix, executeAndSaveStabilityResults } from '../harness/stability';
import { generateStabilityReports } from '../harness/report';
import { CAUSE_CODES, type StabilitySummary } from '../harness/matrix';
import type { CorpusManifest } from '../corpus/generate-manifest';

describe('Milestone 6.1 — Corpus and Stability Harness (24,000-cell matrix)', () => {
  const corpusPath = path.resolve(__dirname, '../corpus/manifest.json');
  const resultsDir = path.resolve(__dirname, '../results');
  let manifest: CorpusManifest;

  beforeAll(() => {
    expect(fs.existsSync(corpusPath)).toBe(true);
    manifest = JSON.parse(fs.readFileSync(corpusPath, 'utf-8')) as CorpusManifest;
  });

  // T6.1.1: Harness runs full matrix
  test('T6.1.1: Harness executes full matrix of 24,000 evaluations across 200 interfaces', () => {
    expect(manifest.interfaces.length).toBe(200);

    const summaryPath = path.join(resultsDir, 'stability-summary.json');
    const matrixPath = path.join(resultsDir, 'stability-matrix.json');
    expect(fs.existsSync(summaryPath)).toBe(true);
    expect(fs.existsSync(matrixPath)).toBe(true);

    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as StabilitySummary;
    expect(summary.total_interfaces).toBe(200);
    expect(summary.total_evaluations).toBe(24000); // 200 * 4 * 5 * 3 * 2

    // Verify matrix JSON structure
    const matrixData = JSON.parse(fs.readFileSync(matrixPath, 'utf-8')) as {
      total_cells: number;
      cells: Array<{ interface_id: string; cause_code: string; digest: string }>;
    };
    expect(matrixData.total_cells).toBe(24000);
    expect(matrixData.cells.length).toBe(24000);
  });

  // T6.1.2: Results reproducible
  test('T6.1.2: Matrix execution is deterministic and reproducible (agreement rate within 0.1%)', () => {
    const run1 = runStabilityMatrix(manifest);
    const run2 = runStabilityMatrix(manifest);

    expect(run1.summary.total_evaluations).toBe(24000);
    expect(run2.summary.total_evaluations).toBe(24000);

    // Rates must agree within 0.1% (in fact exact match)
    const diffMatched = Math.abs(
      run1.summary.matched_env_agreement_rate_pct - run2.summary.matched_env_agreement_rate_pct,
    );
    const diffBrowser = Math.abs(
      run1.summary.cross_browser_agreement_rate_pct - run2.summary.cross_browser_agreement_rate_pct,
    );

    expect(diffMatched).toBeLessThanOrEqual(0.1);
    expect(diffBrowser).toBeLessThanOrEqual(0.1);

    expect(run1.summary.render_failures).toBe(run2.summary.render_failures);
  });

  // T6.1.3: Disagreements classified
  test('T6.1.3: Every single disagreement has an explicit, valid cause code', () => {
    const matrixPath = path.join(resultsDir, 'stability-matrix.json');
    const matrixData = JSON.parse(fs.readFileSync(matrixPath, 'utf-8')) as {
      cells: Array<{ agrees_with_baseline: boolean; cause_code: string }>;
    };

    const validCauses = Object.values(CAUSE_CODES);

    let disagreementCount = 0;
    for (const cell of matrixData.cells) {
      expect(validCauses).toContain(cell.cause_code);
      if (!cell.agrees_with_baseline) {
        disagreementCount++;
        expect(cell.cause_code).not.toBe(CAUSE_CODES.NONE);
      } else {
        expect(cell.cause_code).toBe(CAUSE_CODES.NONE);
      }
    }

    const summary = JSON.parse(
      fs.readFileSync(path.join(resultsDir, 'stability-summary.json'), 'utf-8'),
    ) as StabilitySummary;

    expect(disagreementCount).toBe(summary.disagreements_count);

    // Sum of all causes in summary must equal total evaluations
    const causeSum = Object.values(summary.disagreements_by_cause).reduce((a, b) => a + b, 0);
    expect(causeSum).toBe(24000);
  });

  // T6.1.4: Responsive axis separate
  test('T6.1.4: Responsive breakpoint axis is measured and reported separately from environment variation', () => {
    const summary = JSON.parse(
      fs.readFileSync(path.join(resultsDir, 'stability-summary.json'), 'utf-8'),
    ) as StabilitySummary;

    // Must have separate evaluation counts and agreement rates
    expect(summary.matched_env_evaluations).toBeGreaterThan(0);
    expect(summary.cross_viewport_evaluations).toBeGreaterThan(0);
    expect(summary.matched_env_evaluations + summary.cross_viewport_evaluations).toBe(24000);

    // Breakpoint analysis file exists and contains all 200 interfaces
    const bpPath = path.join(resultsDir, 'stability-breakpoint-analysis.json');
    expect(fs.existsSync(bpPath)).toBe(true);
    const bpData = JSON.parse(fs.readFileSync(bpPath, 'utf-8')) as Array<{
      interface_id: string;
      breakpoints: number[];
      desktop_digest: string;
      mobile_digest: string;
    }>;
    expect(bpData.length).toBe(200);
  });

  // T6.1.5: Failures not discarded
  test('T6.1.5: Execution and render failures are counted explicitly rather than silently dropped', () => {
    const summary = JSON.parse(
      fs.readFileSync(path.join(resultsDir, 'stability-summary.json'), 'utf-8'),
    ) as StabilitySummary;

    expect(summary.render_failures).toBeGreaterThan(0);
    expect(summary.disagreements_by_cause[CAUSE_CODES.RENDER_FAILURE]).toBe(
      summary.render_failures,
    );

    // Total evaluations in matrix remains exactly 24,000 despite failures
    expect(summary.total_evaluations).toBe(24000);
  });

  // T6.1.6: Table generated
  test('T6.1.6: Stability table is generated in paper-ready Markdown and LaTeX formats from data', () => {
    const reports = generateStabilityReports(resultsDir);

    expect(reports.markdown).toContain('# Empirical Evaluation: Cross-Environment Stability Matrix');
    expect(reports.markdown).toContain('Cross-Browser');
    expect(reports.markdown).toContain('99.13%');
    expect(reports.markdown).toContain('BREAKPOINT_RELAYOUT');

    expect(reports.latex).toContain('\\begin{table}');
    expect(reports.latex).toContain('\\caption{Cross-Environment Stability');
    expect(reports.latex).toContain('\\toprule');
    expect(reports.latex).toContain('\\end{table}');

    expect(fs.existsSync(path.join(resultsDir, 'stability-table.md'))).toBe(true);
    expect(fs.existsSync(path.join(resultsDir, 'stability-table.tex'))).toBe(true);
  });
});
