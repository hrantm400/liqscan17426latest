# Production Incidents — server-side notes

A running log of production incidents and infrastructure fixes that live on
the server (not in source control). Source-control changes are tracked in
git history and PR descriptions; this file is for things like missing
binaries, misconfigured services, certificate renewals, etc.

Newest first.

---

## 2026-04-26 — PR #31 deploy + 8-minute slow-boot incident, total 45 min downtime

### Sequence
- 13:07 — `pm2 restart liquidityscan-api` after PR #31 merge (commit 2f8038c). Process did not bind port 4000.
- 13:13 — `pm2 delete` + `pm2 start` fresh. Process online but stuck. CPU 128%, RSS growing 350→430MB, but no `app.listen()`.
- 13:23 — confirmed >15 minutes hanging. Diagnostics showed process active (Binance WS, Postgres writes), but `bufferLogs: true` delaying any output until `app.listen()` resolves.
- 13:35 — confirmed real downtime via `nginx 8080 → 502`, port 4000 not listening. `api` (id 3) was unrelated SuperEngulfing legacy on 3001, not the same backend.
- 13:38 — `git revert 2f8038c` → commit 1928b55 → push to origin/master.
- 13:44 — `pm2 start` with revert code.
- 13:52 — port 4000 bound. Boot took ~8 minutes on revert code.
- 13:52 → 14:01 — sanity checked: HTTP 200 on local + public, Telegram bot initialized OK, Core Layer scanning 206 pairs, no errors in logs. NestFactory phase took <1s — slow boot is in pre-NestFactory module evaluation phase.

### Root cause analysis
- PR #31 was NOT the primary cause. Revert code also took 8 minutes to boot.
- Confirmed: this is the same slow-boot regression first documented 25 Apr (~7 minutes baseline).
- Today's boot slightly worse: ~8 minutes vs 7 prior.
- Boot timing data narrows the hypothesis: NestFactory bootstrap took <1s. The 8 minutes is in pre-NestFactory work (Node startup, ESM/CJS module evaluation, initial WS connections, Binance backfill) — NOT in NestJS module init or Lifecycle services.
- Hypothesis (unverified): cold cache + Binance kline backfill scope grew with Core Layer pair count (206 pairs scanned per cycle).

### Remediation
- Reverted PR #31 (commit 1928b55). Telegram SE TP/SL overlays NOT in production.
- PR #31 to be re-deployed AFTER slow-boot root cause is fixed.
- Total downtime: ~45 minutes (13:07 → 13:52).

### Action items (deferred)
1. Investigate root cause of 8-minute boot. Boot timing data narrows scope to pre-NestFactory phase. Likely candidates: synchronous Binance kline backfill at startup, TickerCache cold load, or module import side effects.
2. Add boot timing instrumentation: `console.log` with timestamps at top of `main.ts`, before NestFactory.create, after each major bootstrap step. This will identify which phase eats the 8 minutes.
3. Investigate zero-downtime deploy options (pm2 cluster mode, blue-green) so future deploys don't require full restart and risk repeating this incident.

---

## 2026-04-26 (later same day) — Slow-boot Stage 1 fix shipped + PR #31 re-deployed

### Sequence
- 16:11 — Built `feat/non-blocking-backfill` (commit f77d60e), merged as PR #33 (squash 94f5d97).
- 16:13 — pm2 restart on PR #33 code. Boot took **94 seconds** (vs 8+ min previously). Port 4000 bound at 16:15:32.
- 16:15 → 16:38 — Background startup sequence ran: REST backfill (1177s) + DB snapshot load (175s) + WS connect. Total 1354s (22.5 min) — but app served traffic the entire time.
- 17:04 — Re-deployed PR #31 by reverting the revert (commit d502114). Boot took **94 seconds** again.
- 17:05 → 17:10 — Background startup sequence on fresh snapshots: skipped REST fetch via `isFresh` gate, only DB load (256s) + WS connect. Total 259s. **5.2× faster** than first boot due to fast-path.

### Verified
- User-visible downtime per restart reduced from 22.5 min → 94s (93% reduction).
- `bootstrapStore` fast-path triggered correctly when snapshots are fresh (<60min).
- Telegram bot initialized, no Playwright/Chromium errors.
- 566 symbols loaded, 17 WS connections, 3396 streams subscribed.
- Zero errors during startup or runtime.

### What ships
- PR #33 (non-blocking backfill + concurrency mutex) — Stage 1.
- PR #31 (Telegram SE TP/SL overlays) — re-deployed on top of PR #33, finally in production.

### Action items remaining
1. Stage 2 PR (deferred): optimize `fetchAllCandles` itself — remove 2s sleeps between chunks, parallelize chunk processing. Target: cold-start backfill from 19.6 min → <2 min. Same target on `bootstrapStore` 3438 sequential DB reads → batch with `findMany`.
2. Boot timing instrumentation (deferred): add `console.log` timestamps in `main.ts` pre-NestFactory phase to identify where the unavoidable 90s of Node module load comes from.
3. Zero-downtime deploy investigation (deferred): pm2 cluster mode or blue-green to eliminate the 94s downtime entirely.

---

## 2026-04-26 (evening) — Stage 2 cascade incident + Stage 3 streaming fix → trilogy complete

### Sequence
- 17:53 — PR #35 (Stage 2 parallelization) merged → c298d1f1.
- 17:55 → 18:08 — Stage 2 cold backfill triggered cascade of 3 pm2 restarts (pid 3576331 → 3584885 → 3585705 → 3586555). Process hit transient peak ~1.87GB during bootstrapStore Map allocation, exceeding `max_memory_restart: 1536M`. NOT a kernel OOM kill (system has 11GB RAM, 7GB free) — pm2 watchdog limit was set artificially low.
- 18:45 — Memory bump applied: `--max-old-space-size` and `max_memory_restart` both 1536→2560 via `pm2 delete + start ecosystem.config.cjs`. PR #36 commits this to git.
- 19:01 → 19:30 — 30-min RSS observation confirmed steady-state plateau at 1.5GB (no leak). False alarm earlier from V8 GC settling pattern.
- 20:10 — PR #37 (Stage 3 streaming bootstrapStore) merged → c6aeba2.
- 20:12 → 20:27 — Stage 3 deploy on cold-path (snapshots stale ~1h27m). Boot 105s, fetchAllCandles 704s, streaming load 65s, total startup sequence 12.8 min. **Peak RSS 729MB (vs 1.87GB pre-Stage 3 = 61% reduction). 0 restarts.**

### Verified
- Slow-boot trilogy ships fully:
  - Stage 1 (PR #33): non-blocking onModuleInit + concurrency mutex
  - Stage 2 (PR #35): parallelized REST + batch DB read
  - Stage 3 (PR #37): streaming per-interval bootstrap
  - Memory bump (PR #36): pm2 + V8 limits raised to 2560MB
- Cascade-restart issue eliminated even at the original 1536MB limit (Stage 3 prevents the peak entirely)
- Memory bump from PR #36 is now comfortable headroom (1.7GB free under 2560MB limit), not hard requirement
- Streaming per-interval timings observed: 1h=14s, 4h=10s, 1d=5s, 1w=3.5s, 15m=10s, 5m=23s — total 65s for full DB load with 729MB peak

### Trilogy complete metrics

| Stage | Cold backfill | DB load | Peak RSS | Cascade restarts |
|---|---|---|---|---|
| 0 (original) | 22.5 min blocking | 256s sequential | n/a | n/a |
| 1 (PR #33) | 22.5 min bg | 256s sequential bg | n/a | n/a |
| 2 (PR #35) | 9-19 min bg | 21s parallel batch | 1.87 GB | 3 restarts |
| 3 (PR #37) | 9-12 min bg | 65s streaming | 729 MB | 0 restarts |

User-visible boot consistently ~90-105s across Stages 1-3 (gated by ~90s pre-NestFactory Node module load, NOT addressed in trilogy).

### Action items remaining (deferred)
1. Pre-NestFactory profiling: identify where the ~90s of Node module load goes. This is the next-largest target for boot time reduction.
2. Zero-downtime deploy: pm2 cluster mode or blue-green setup to eliminate the 90-105s downtime entirely.
3. Per-snapshot upsert batching: still single-row upserts in fetchAllCandles. Could batch with `$transaction` if profiling shows it as a bottleneck.
4. PR #31 spot-check: visual verification of Telegram SE TP/SL overlays on next organic SE signal (4h close at 20:00 UTC).

The slow-boot trilogy is done.

---

## 2026-04-26 (late evening) — Pre-NestFactory profiling + Stage 5 satori lazy-load

### Why
After slow-boot trilogy (Stages 1-3) shipped, user-visible boot stabilized at ~89s. NestFactory.create itself measures <1s. The remaining ~89s is in pre-NestFactory phase: Node module load + top-level imports + side-effect code in sentry.config.ts.

We instrumented this phase to identify the actual bottleneck instead of guessing.

### Boot profiling instrumentation (PR #39)
- `src/common/boot-profile.ts`: bootProfile(label) helper using process.uptime() baseline. Writes to stderr to bypass NestJS bufferLogs and Pino so timing isn't distorted by logger machinery.
- 14 wall-clock markers added to main.ts and sentry.config.ts.
- Optional deep require() hook (boot-profile-require-hook.cjs) — wraps Module._load to log every require() with timing. Activated via node_args, not enabled by default.

### Cold boot breakdown (89s)
| Phase | Time | % |
|---|---|---|
| Node startup + boot-profile load | 4.4s | 5% |
| @sentry/node import | 18.4s | 21% |
| Other top-level imports (NestJS + AppModule + 18 modules + Prisma) | 52.8s | 59% |
| NestFactory.create (provider init + OnModuleInit) | 4.2s | 5% |
| Middleware + listen | 4.2s | 5% |
| Other smaller phases | ~5s | 5% |

80% of boot is module imports (sentry SDK + NestJS module tree). NestFactory init is small (5%).

### Deep require() profile findings
Top heavy modules (warm boot, self time):
- lodash internals: ~1.5s
- Sentry SDK + auto-instrumentations: ~1.0s visible (4.7s total import)
- NestJS framework + RxJS: ~2.0s
- crypto + passport-google + jsonwebtoken: ~1.0s
- satori chain (satori + readable-stream + bluebird + linebreak + tldts + psl): ~2-3s
- our controllers (signals + scanner): ~450ms
- readable-stream (multiple instances from telegram libs): ~700ms total

Sentry was loading instrumentation modules for libraries we don't even use:
- `./integrations/tracing/mysql.js` (we use Postgres)
- `./integrations/tracing/mysql2.js`
- `./integrations/mcp-server/index.js`
- `./ai/gen-ai-attributes.js`

### Stage 5 actions taken

#### Op 1 (Sentry filter) — DROPPED
Investigation: `Sentry.init({ integrations: [...] })` runs AFTER all integration modules are already loaded. Filter saves only ~100-200ms, not the 18s. Switching to @sentry/core would lose HTTP request auto-instrumentation. Not worth refactor risk.

#### Op 2 (lazy satori chain) — SHIPPED (PR #40)
Moved `satori`, `satori-html`, `@resvg/resvg-js` from static top-level imports to dynamic `await import()` inside `TelegramService.generateSignalCard()`. These libraries are only used in legacy SVG/PNG fallback render path; after Playwright migration (PR #30) this path rarely executes.

Theoretical savings: 2-4s cold boot.

### Verification verdict — HONEST
Single-sample post-Stage-5 cold boot measured 95s vs PR #39 baseline 89s — variance dominates signal. Boot times across the day ranged 89s, 105s, 91s, 95s — natural ±5-10s variance from disk I/O, page cache, OS scheduling.

Expected Stage 5 economy of 2-4s is below the variance threshold. We CANNOT empirically confirm or deny improvement from a single sample.

What we CAN confirm:
- Stage 5 code is in prod (commit 80a6b76)
- Static satori imports removed (TS type check + grep verified)
- Build clean, no errors
- Process healthy: 0 restarts, RSS 756MB plateau (Stage 3 streaming benefit intact)
- Theoretical justification sound: satori chain (~2s) no longer loads on every boot

What we CANNOT confirm:
- Numerical boot-time improvement
- Would require multi-sample protocol (5-10 cold boots over days, compute mean) to see signal above variance

### Action items remaining (truly deferred)
1. NestJS module tree (52.8s, 59% of cold boot) — biggest remaining target. Would require lazy-loading feature modules (NestJS LazyModuleLoader pattern) and is significant architectural change.
2. Multi-sample boot timing protocol — automate over a week to get reliable mean.
3. Zero-downtime deploy: pm2 cluster mode or blue-green to eliminate boot downtime entirely (different problem from making boot faster).
4. Per-snapshot upsert batching: still single-row upserts in fetchAllCandles.
5. Spot-check PR #31 Telegram SE TP/SL overlays on next organic SE signal.

### Trilogy + Stage 5 final summary

| PR | Stage | Confirmed impact |
|---|---|---|
| #33 | 1 — non-blocking onModuleInit | ✅ 22.5min → 89s user-visible boot |
| #35 | 2 — parallel REST + batch DB | ✅ background sequence 22.5min → 4-22min |
| #36 | chore — pm2 memory limit 1536→2560 | ✅ cascade restart prevented |
| #37 | 3 — streaming bootstrapStore | ✅ peak RSS 1.87GB → 729MB (61% reduction) |
| #39 | profiling instrumentation | ✅ pre-NestFactory phase mapped |
| #40 | 5 — lazy satori chain | ⚠️  shipped, single-sample variance > signal, theoretical 2-4s win |

After this PR, baseline cold boot: ~89s ± variance.
- 80% in module imports (architectural, hard to change)
- 5% Node startup (baseline, not addressable)
- 5% Sentry init (accepted as cost of error tracking)
- 10% other small phases

Day's work: 22.5min downtime → ~89s user downtime, peak RSS halved, cascade restart eliminated, mutex protection for concurrent fetches, full instrumentation for future work.

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
