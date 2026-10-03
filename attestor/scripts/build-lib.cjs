'use strict';
/**
 * Builds the Attestor Module. Used by the release build and by the browser tests, so the code that
 * is tested is the code that ships.
 *
 * Two passes: the worker entry is bundled to a script string first, then the main entry is bundled
 * with that string embedded (the worker is started from a Blob URL, so the module remains a single
 * file and a single integrity hash covers all of it).
 *
 * Reproducibility: no timestamps, no absolute paths in the output, a pinned esbuild version (see
 * package.json), identical options on every machine.
 */
const path = require('path');
const { buildSync } = require('esbuild');

const root = path.join(__dirname, '..');

function bundle(entry, extra) {
  const result = buildSync({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    legalComments: 'none',
    charset: 'ascii',
    absWorkingDir: root,
    logLevel: 'silent',
    ...extra,
  });
  return result.outputFiles[0].text;
}

function buildAttestor({ minify = true, version } = {}) {
  const pkgVersion = version ?? require(path.join(root, 'package.json')).version;
  const workerCode = bundle('src/worker.ts', { minify });
  const code = bundle('src/index.ts', {
    minify,
    globalName: 'MRAttestor',
    define: {
      __WORKER_SOURCE__: JSON.stringify(workerCode),
      __ATTESTOR_VERSION__: JSON.stringify(pkgVersion),
    },
  });
  return { code, workerCode, version: pkgVersion };
}

module.exports = { buildAttestor };
