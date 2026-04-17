#!/usr/bin/env node
/**
 * Toggle MARKET_SCANNER_ENABLED in backend/.env (create file if missing).
 * Usage: node scripts/set-market-scanner-env.js on|off|status
 * After changing .env, restart the API (e.g. pm2 restart liquidityscan-api).
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const mode = (process.argv[2] || '').toLowerCase();

function readLines() {
  if (!fs.existsSync(envPath)) return [];
  return fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
}

function writeLines(lines) {
  const body = lines.join('\n').replace(/\n*$/, '\n');
  fs.writeFileSync(envPath, body, 'utf8');
}

function setValue(enabled) {
  const key = 'MARKET_SCANNER_ENABLED';
  const value = enabled ? 'true' : 'false';
  let lines = readLines();
  const re = new RegExp(`^\\s*${key}\\s*=`);
  let found = false;
  lines = lines.map((line) => {
    if (re.test(line)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) {
    if (lines.length && lines[lines.length - 1].trim() !== '') {
      lines.push('');
    }
    lines.push(`# When false, hourly + POST /signals/scan market scan is skipped (saves Binance API usage).`);
    lines.push(`${key}=${value}`);
  }
  writeLines(lines);
  console.log(`Wrote ${envPath}: ${key}=${value}`);
  console.log('Restart the backend for the change to apply (e.g. pm2 restart liquidityscan-api).');
}

function showStatus() {
  const lines = readLines();
  const re = /^\s*MARKET_SCANNER_ENABLED\s*=\s*(.*)$/i;
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      const v = (m[1] || '').trim().replace(/^["']|["']$/g, '');
      const off = ['0', 'false', 'no', 'off', 'disabled'].includes(v.toLowerCase());
      console.log(`MARKET_SCANNER_ENABLED=${v} → market scan ${off ? 'OFF' : 'ON'}`);
      return;
    }
  }
  console.log('MARKET_SCANNER_ENABLED not set in .env → defaults to ON (enabled).');
}

if (mode === 'off' || mode === 'disable' || mode === '0' || mode === 'false') {
  setValue(false);
} else if (mode === 'on' || mode === 'enable' || mode === '1' || mode === 'true') {
  setValue(true);
} else if (mode === 'status' || mode === '') {
  showStatus();
} else {
  console.error('Usage: node scripts/set-market-scanner-env.js <on|off|status>');
  process.exit(1);
}
