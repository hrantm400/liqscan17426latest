/**
 * PM2 config for LiquidityScan API (NestJS backend).
 * On server: cd liquidityscan-web/backend && npm run build && pm2 start ecosystem.config.cjs
 */
const path = require('path');

// NestJS build: main.js может быть в dist/ или в dist/src/
const distMain = path.join(__dirname, 'dist', 'main.js');
const distSrcMain = path.join(__dirname, 'dist', 'src', 'main.js');
const scriptPath = require('fs').existsSync(distMain) ? distMain : distSrcMain;

module.exports = {
  apps: [
    {
      name: 'liquidityscan-api',
      script: scriptPath,
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        // Align with PM2 limit so V8 can use heap before OOM during large /signals + live-bias workloads.
        // --experimental-require-module is required for Node 20 to CJS-require()
        // the ESM-only `satori-html` pulled in by TelegramService (used for TG
        // image cards). Node 22 makes this a default, so the flag can be dropped
        // after the server node is upgraded.
        NODE_OPTIONS: '--max-old-space-size=1536 --experimental-require-module',
        // Uncomment to disable hourly + POST /signals/scan market scanning (dev / saving Binance keys):
        // MARKET_SCANNER_ENABLED: 'false',
      },
      // 500M was too low: PM2 restarted the API under load → nginx 502 while the process was down.
      max_memory_restart: '1536M',
      min_uptime: '10s',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
