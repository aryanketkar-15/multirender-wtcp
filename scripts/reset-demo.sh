#!/usr/bin/env bash
# One-command demo reset script for Bash / Linux / Git Bash
set -euo pipefail

echo "============================================="
echo "  MRA System: Resetting Demo Starting State  "
echo "============================================="

PHP_BIN="${MRA_PHP:-php}"
PHP_FLAGS="-d extension=sodium -d extension=zip"

echo "[1/5] Purging transient email outbox..."
find server/var/outbox -type f ! -name ".gitkeep" -delete 2>/dev/null || true

echo "[2/5] Verifying database schema migrations..."
$PHP_BIN $PHP_FLAGS server/bin/migrate.php up

echo "[3/5] Registering Attestor v1.1.0 manifest..."
$PHP_BIN $PHP_FLAGS server/bin/register_attestor.php attestor/dist/manifest.json

echo "[4/5] Seeding deterministic demo accounts..."
$PHP_BIN $PHP_FLAGS server/bin/seed_demo.php

echo "[5/5] Signing current Merkle Tree Head..."
$PHP_BIN $PHP_FLAGS server/bin/sign_sth.php

echo "============================================="
echo "  PRISTINE DEMO STATE READY                  "
echo "  User:  demo@vit.edu / DemoPassword123!     "
echo "  Admin: admin@vit.edu / AdminPassword123!   "
echo "============================================="
