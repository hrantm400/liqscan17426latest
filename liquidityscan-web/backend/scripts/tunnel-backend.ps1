# Cloudflare Quick Tunnel for backend (for NOWPayments IPN callback)
# 1. Start your backend first: npm run start:dev (port 3000)
# 2. Run this script: .\scripts\tunnel-backend.ps1
# 3. Copy the URL from the output (https://....trycloudflare.com)
# 4. Add to .env: NOWPAYMENTS_IPN_CALLBACK_URL=https://....trycloudflare.com/api/payments/nowpayments-webhook

$BackendPort = 3000

Write-Host ""
Write-Host "Backend tunnel (port $BackendPort)" -ForegroundColor Cyan
Write-Host "Make sure backend is running: npm run start:dev" -ForegroundColor Yellow
Write-Host ""
Write-Host "When you see a URL like https://xxxx.trycloudflare.com below," -ForegroundColor Green
Write-Host "add to your .env file:" -ForegroundColor Green
Write-Host "  NOWPAYMENTS_IPN_CALLBACK_URL=https://xxxx.trycloudflare.com/api/payments/nowpayments-webhook" -ForegroundColor White
Write-Host "(replace xxxx with your actual tunnel host)" -ForegroundColor Gray
Write-Host ""

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
    Write-Host "cloudflared not found. Install:" -ForegroundColor Red
    Write-Host "  winget install Cloudflare.cloudflared" -ForegroundColor White
    Write-Host "  or: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/" -ForegroundColor White
    exit 1
}

Set-Location $PSScriptRoot\..
& cloudflared tunnel --url "http://localhost:$BackendPort"
