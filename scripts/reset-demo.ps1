# One-command demo reset script for Windows PowerShell
# Returns the MRA system to a clean, deterministic starting state for viva examination.

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  MRA System: Resetting Demo Starting State  " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

$PHP_BIN = if (Test-Path "C:\xampp\php\php.exe") { "C:\xampp\php\php.exe" } else { "php" }
$PHP_FLAGS = "-d extension=sodium -d extension=zip"

function Invoke-Php {
    param([string]$Script, [string[]]$Arguments)
    & $PHP_BIN -d extension=sodium -d extension=zip $Script $Arguments
}

# 1. Clean development email outbox
Write-Host "[1/5] Purging transient email outbox..." -ForegroundColor Yellow
if (Test-Path "server\var\outbox") {
    Get-ChildItem -Path "server\var\outbox" -Exclude ".gitkeep" | Remove-Item -Force -ErrorAction SilentlyContinue
}

# 2. Database migrations check
Write-Host "[2/5] Verifying database schema migrations..." -ForegroundColor Yellow
Invoke-Php "server\bin\migrate.php" @("up")

# 3. Re-register Attestor build
Write-Host "[3/5] Registering Attestor v1.1.0 manifest..." -ForegroundColor Yellow
Invoke-Php "server\bin\register_attestor.php" @("attestor\dist\manifest.json")

# 4. Seed demo users
Write-Host "[4/5] Seeding deterministic demo accounts..." -ForegroundColor Yellow
Invoke-Php "server\bin\seed_demo.php"

# 5. Sign tree head
Write-Host "[5/5] Signing current Merkle Tree Head..." -ForegroundColor Yellow
Invoke-Php "server\bin\sign_sth.php"

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  PRISTINE DEMO STATE READY                  " -ForegroundColor Green
Write-Host "  User:  demo@vit.edu / DemoPassword123!     " -ForegroundColor Green
Write-Host "  Admin: admin@vit.edu / AdminPassword123!   " -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
