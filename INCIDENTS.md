# Production Incidents — server-side notes

A running log of production incidents and infrastructure fixes that live on
the server (not in source control). Source-control changes are tracked in
git history and PR descriptions; this file is for things like missing
binaries, misconfigured services, certificate renewals, etc.

Newest first.

---

## 2026-04-25 — Chart library migration completed

Migrated from `lightweight-charts` to `klinecharts` across all chart surfaces (frontend signal page + Core-Layer mini tiles + FloatingChart wrapper + backend Telegram Playwright PNG renderer).

Migration chain: PRs #7, #8, #16-22, #25, #27-29 (~15 PRs over ~24h).

Bundle delta:
- chart-vendor: 162.3 KB → 202.0 KB raw (+39 KB, klinecharts is larger than LW)
- index: 658.6 KB → 429.0 KB raw (−229 KB, removed 1606-LOC LW chart + wrappers)
- Net total: −196 KB raw, −61 KB gzipped

Known tech debt:
- CISD overlays still use a LW-shaped shim layer (drawCisdOverlays.ts + klineCisdAdapter.ts + cisdOverlayGeometry.ts) instead of native klinecharts overlays. Pragmatic choice — rewriting CISD natively risks regression. Revisit if new CISD features need it.
- v1 cached PNG on Cloudflare expires ~2026-05-25, harmless (synthetic test data).

Deferred for future product work:
- Chunk #7b — overlay-rich Telegram alerts (currently candles + arrow only). High potential retention impact, separate planning needed.

Future audits for big removals: grep should include vite.config.ts and other build configs, not just src/.

---

## 2026-04-25 — Telegram alerts silently degraded to satori SVG fallback for 23 days

**Discovered during:** Chunk #7 verification (klinecharts Playwright migration, PR #27 merged earlier same day).

**What was broken:**
The `TelegramChartPlaywrightService.renderCandlestickPng()` path returned
`null` on every invocation since 2026-04-02. Every Telegram alert sent in
that window therefore fell through to the satori SVG card path
(`telegram.service.ts:217-...`) instead of the richer Playwright PNG.
Users got the lower-fidelity fallback for ~23 days without anyone noticing.

**Root cause — three layers:**
1. `playwright` and `playwright-core` npm packages were updated on
   2026-04-02 13:27 (file mtime on `node_modules/playwright/package.json`).
2. The post-update step `npx playwright install` was never run, so the
   bundled Chromium binary at
   `/root/.cache/ms-playwright/chromium_headless_shell-1217/...` was
   missing — directory `/root/.cache/ms-playwright/` did not exist at all.
3. Even after installing the binary, system shared libraries required by
   headless Chromium were missing (libatk-1.0, libatk-bridge-2.0, libcups,
   libxkbcommon, libxcomposite, libxdamage, libxfixes, libxrandr, etc.),
   producing `error while loading shared libraries: libatk-1.0.so.0`.

The error path inside `getBrowser()` swallows the failure and returns
`null` (intentional — Playwright is documented as optional, with the
satori fallback as a graceful degradation). That's why no alerts surfaced
in monitoring; the swallow is correct, but the silent degradation hid the
fact that the rich path had been broken for weeks.

**Fix applied (2026-04-25, ~16:10–16:15 server time):**
```
npx playwright install chromium       # ~115 MB to /root/.cache/ms-playwright/
npx playwright install-deps chromium  # apt install of system libs
```

**Verification:**
- `/root/.cache/ms-playwright/chromium_headless_shell-1217/.../chrome-headless-shell --version`
  returned `Google Chrome for Testing 147.0.7727.15`.
- Synthetic render via `/tmp/test-kline-png.cjs` produced a valid 920×440
  PNG (14.85 KB, RGB, non-interlaced) in 2.16 s. Output saved to
  `/tmp/kline-telegram-test.png`.

**Not caused by Chunk #7.** Static diff of the active service vs
`telegram-chart-playwright.service.ts.lw.bak` shows method-body-only
changes (renderInner internals, type rename, dedupe field rename). No
new module-level code, no new constructor logic, no new `OnModuleInit`.
The migration only *exposed* the rot during verification — the rot
predates it by 23 days.

**Ongoing risk to watch:**
- Any future `npm install` / `npm update` that bumps Playwright will
  re-create this hole. The post-install hook isn't part of the deploy
  script. Deploy runbook should include
  `npx playwright install chromium` after any Playwright bump.
- A separate, unrelated boot-time regression was observed during the
  same deploy: liquidityscan-api took ~7 minutes to bind its HTTP port
  (vs. historical 13–22 s). Hypothesis: 17-hour cache staleness +
  Binance backfill, since the previous backend restart was ~17 h prior.
  Static diff of the changed file rules out the migration as the cause.
  Will confirm on next pm2 restart — if still 5+ min, dedicated
  investigation.
