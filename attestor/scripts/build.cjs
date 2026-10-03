'use strict';
/**
 * Release build: attestor/dist/mra-attestor-<version>.js plus manifest.json.
 *
 * The manifest carries the two hashes that matter:
 *   sha384  the Subresource Integrity value placed in the <script integrity="..."> attribute
 *   sha256  the attestor_hash named inside every server commitment and checked by the verifier
 * Both are computed over the exact bytes written, so anyone can recompute them from the file.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { buildAttestor } = require('./build-lib.cjs');

function manifestFor(code, version) {
  const bytes = Buffer.from(code, 'utf8');
  return {
    version,
    file: `mra-attestor-${version}.js`,
    sha384: 'sha384-' + crypto.createHash('sha384').update(bytes).digest('base64'),
    sha256: 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  };
}

function build(outDir) {
  const { code, version } = buildAttestor({ minify: true });
  const manifest = manifestFor(code, version);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, manifest.file), code, { encoding: 'utf8' });
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

module.exports = { build, manifestFor };

if (require.main === module) {
  const out = path.join(__dirname, '..', 'dist');
  const m = build(out);
  console.log(`built ${m.file} (${m.bytes} bytes)`);
  console.log(`  integrity: ${m.sha384}`);
  console.log(`  attestor_hash: ${m.sha256}`);
}
