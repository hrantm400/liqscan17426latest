# One-time setup: create PostgreSQL user and DB without knowing postgres password
# Run as Administrator: Right-click PowerShell -> Run as Administrator, then:
#   cd "C:\Users\hrant\Desktop\liquidityscan -MEGA\liquidityscan-web\backend"
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
#   .\scripts\setup-db-no-password.ps1
# If you have PostgreSQL 15/16/17, change $pgVersion below to "15", "16", or "17".

$ErrorActionPreference = "Stop"
$pgVersion = "18"
$pgData = "C:\Program Files\PostgreSQL\$pgVersion\data"
$pgBin = "C:\Program Files\PostgreSQL\$pgVersion\bin"
$pgHba = "$pgData\pg_hba.conf"
$serviceName = "postgresql-x64-$pgVersion"
$scriptDir = $PSScriptRoot

if (-not (Test-Path $pgHba)) {
  Write-Host "PostgreSQL data not found at $pgData. Edit script: set `$pgVersion (e.g. 15, 16, 17, 18)." -ForegroundColor Red
  exit 1
}

# Backup pg_hba.conf
$backup = "$pgHba.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $pgHba $backup -Force
Write-Host "Backup: $backup" -ForegroundColor Green

# Switch local connections to trust temporarily (so we can connect without password)
$lines = Get-Content $pgHba
$lines = $lines | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { $_ }
  elseif ($_ -match '127\.0\.0\.1/32|::1/128') { $_ -replace '\b(scram-sha-256|md5|peer)\b', 'trust' }
  else { $_ }
}
$lines | Set-Content $pgHba

# Restart PostgreSQL so new auth applies
Write-Host "Restarting PostgreSQL..." -ForegroundColor Yellow
Restart-Service $serviceName -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# Create user and database (no password needed now)
Write-Host "Creating user liquidityscan and database liquidityscan_db..." -ForegroundColor Yellow
$out = & "$pgBin\psql.exe" -U postgres -h localhost -f "$scriptDir\create-db-user.sql" 2>&1
$out | Out-Host
if ($LASTEXITCODE -ne 0 -and $out -notmatch 'already exists') {
  Write-Host "First SQL script failed. Restoring pg_hba.conf..." -ForegroundColor Red
  Copy-Item $backup $pgHba -Force
  Restart-Service $serviceName -Force
  exit 1
}

& "$pgBin\psql.exe" -U postgres -h localhost -d liquidityscan_db -f "$scriptDir\grant-public.sql" 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Grant script failed (DB may already exist). Continuing..." -ForegroundColor Yellow
}

# Restore pg_hba.conf: trust -> scram-sha-256 (password required again)
$lines = Get-Content $pgHba
$lines = $lines | ForEach-Object {
  if ($_ -match '127\.0\.0\.1/32|::1/128' -and $_ -match '\btrust\b') { $_ -replace '\btrust\b', 'scram-sha-256' }
  else { $_ }
}
$lines | Set-Content $pgHba

Restart-Service $serviceName -Force
Write-Host "Done. PostgreSQL auth restored." -ForegroundColor Green
Write-Host "Next: cd backend && npm run db:push && npm run start:dev" -ForegroundColor Cyan
