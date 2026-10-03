#!/usr/bin/env bash
# Attestor release: build from a clean tree, prove the build is reproducible, print what to publish.
#
#   attestor/scripts/release.sh
#
# It does not deploy and it holds no credentials. Publishing the printed file to the independent
# static host, and registering the hash on the server, are separate steps (docs/attestor-release.md).
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain -- . ':!dist')" ]; then
  echo "refusing to release: attestor/ has uncommitted changes" >&2
  exit 1
fi

npm ci --silent
npm run --silent lint
npm test --silent

rm -rf dist
node scripts/build.cjs > /dev/null
first=$(node -p "require('./dist/manifest.json').sha256")

rm -rf dist
node scripts/build.cjs > /dev/null
second=$(node -p "require('./dist/manifest.json').sha256")

if [ "$first" != "$second" ]; then
  echo "NOT REPRODUCIBLE: two builds produced different hashes ($first vs $second)" >&2
  exit 1
fi

version=$(node -p "require('./dist/manifest.json').version")
integrity=$(node -p "require('./dist/manifest.json').sha384")
echo
echo "attestor $version is reproducible"
echo "  file           attestor/dist/mra-attestor-$version.js"
echo "  attestor_hash  $second"
echo "  integrity      $integrity"
echo
echo "next: tag attestor-v$version, publish the file to the attestor host,"
echo "      then: php server/bin/register_attestor.php attestor/dist/manifest.json"
