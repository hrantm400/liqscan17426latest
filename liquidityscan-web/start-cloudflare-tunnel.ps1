# PowerShell script to start Cloudflare Tunnel
# This script will create a tunnel and expose local services

Write-Host "Starting Cloudflare Tunnel..." -ForegroundColor Green
Write-Host ""

# Check if cloudflared is installed
$cloudflaredPath = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflaredPath) {
    Write-Host "ERROR: cloudflared is not installed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install cloudflared:" -ForegroundColor Yellow
    Write-Host "1. Download from: https://github.com/cloudflare/cloudflared/releases" -ForegroundColor Yellow
    Write-Host "2. Or use: winget install --id Cloudflare.cloudflared" -ForegroundColor Yellow
    Write-Host "3. Or use: choco install cloudflared" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "cloudflared found at: $($cloudflaredPath.Source)" -ForegroundColor Cyan
Write-Host ""

# Change to project directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Check if frontend and backend are running
Write-Host "Checking if services are running..." -ForegroundColor Cyan

$frontendRunning = Test-NetConnection -ComputerName localhost -Port 5173 -InformationLevel Quiet -WarningAction SilentlyContinue
$backendRunning = Test-NetConnection -ComputerName localhost -Port 3001 -InformationLevel Quiet -WarningAction SilentlyContinue

if (-not $frontendRunning) {
    Write-Host "WARNING: Frontend (port 5173) is not running!" -ForegroundColor Yellow
    Write-Host "Start the frontend with: cd frontend && npm run dev" -ForegroundColor Yellow
    Write-Host ""
}

if (-not $backendRunning) {
    Write-Host "WARNING: Backend (port 3000) is not running!" -ForegroundColor Yellow
    Write-Host "Start the backend with: cd backend && npm run start:dev" -ForegroundColor Yellow
    Write-Host ""
}

if (-not $frontendRunning -and -not $backendRunning) {
    Write-Host "ERROR: Neither frontend nor backend is running!" -ForegroundColor Red
    Write-Host "Please start at least one service before running the tunnel." -ForegroundColor Red
    Write-Host ""
    exit 1
}

Write-Host "Starting tunnel..." -ForegroundColor Green
Write-Host ""
Write-Host "Tunnel URLs will be displayed below:" -ForegroundColor Cyan
Write-Host ""

# Start the tunnel using quick tunnel mode (temporary URL on trycloudflare.com)
cloudflared tunnel --url http://localhost:5173

Write-Host ""
Write-Host "Tunnel stopped." -ForegroundColor Yellow
