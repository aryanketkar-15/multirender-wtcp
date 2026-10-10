/**
 * harness/run-sensitivity.ts
 * CLI launcher for the sensitivity harness.
 * Separated from sensitivity.ts so ts-jest can import sensitivity.ts in CJS mode.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSensitivityHarness } from './sensitivity.js';
import type { CorpusManifest } from '../corpus/generate-manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CORPUS_PATH = path.resolve(__dirname, '../corpus/manifest.json');
const RESULTS_DIR = path.resolve(__dirname, '../results');

const corpus: CorpusManifest = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf-8'));
const report = runSensitivityHarness(corpus);

const timestamp = report.generated_at.replace(/[:.]/g, '-').slice(0, 19);
const outPath = path.join(RESULTS_DIR, `sensitivity-${timestamp}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
console.log(`Sensitivity report written to: ${outPath}`);
console.log(`Overall detection rate: ${report.overall_detection_rate_pct}%`);
console.log(`Control false positives: ${report.control_false_positives}`);
console.log(`Fully detected: ${report.fully_detected_mutations} / ${report.dark_pattern_mutations}`);
