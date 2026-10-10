/**
 * harness/run-stability.ts
 * CLI launcher for the stability harness.
 * Separate from stability.ts so ts-jest can import stability.ts without import.meta errors.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeAndSaveStabilityResults } from './stability.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = path.resolve(__dirname, '..');

executeAndSaveStabilityResults(undefined, undefined, baseDir);
