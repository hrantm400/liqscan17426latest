# Phase 3 — Tech-Debt Backlog

Tracking follow-up items discovered during Phase 2 (schema/type unification).
These are **deferred**, not blocking, and must not be started without explicit approval.

## Open items

### TD-1 — Rename SE runtime result/reason fields for terminology consistency
- **Source:** PR 2.3 follow-up.
- **Context:** `SeProcessResult` in `backend/src/signals/se-runtime.ts` still exposes
  `result_v2` and `result_type`. The DB columns with those names were dropped in PR 2.3;
  the runtime type is now the only consumer of these names, which is confusing.
- **Action:**
  - `SeProcessResult.result_v2 → result` (align with `SignalResult` terminology).
  - `SeProcessResult.result_type → reason` (aligns with `se_close_reason`).
- **Impact:** `lifecycle.service.ts` callers, `se-runtime.spec.ts`.

### TD-2 — Full legacy SE fields removal (9 columns including `se_close_reason`)
- **Source:** PR 2.3 follow-up.
- **Context:** PR 2.2 preserved 9 legacy SE columns (including `se_close_reason`,
  `tp1_hit`, `tp2_hit`, `tp3_hit`, `entry_candle_*`, etc.). PR 2.3 kept
  `se_close_reason` because `SignalStatusBadge` still derives CRT/3OB/SE close-reason
  labels from it (TP1/TP2/TP3/SL/Expiry).
- **Blocker:** Need a canonical replacement source for the badge's close-reason
  granularity before these columns can be dropped.
- **Action (proposed):**
  - Introduce a shared `close_reason` enum column applicable to all strategies
    (CRT, 3OB, SE), backfill from existing signals.
  - Migrate `SignalStatusBadge` SE/CRT/3OB branches to read from `close_reason`.
  - Drop all 9 legacy SE columns in a subsequent PR with zero-downtime protocol.

### TD-3 — Rename `state`/`status` naming inside `se-runtime`
- **Source:** PR 2.3 follow-up.
- **Context:** The runtime module still uses `state` (`'live' | 'closed'`) and legacy
  `status` terminology internally. Now that the DB no longer has these columns, the
  in-memory vocabulary should align with `lifecycleStatus` / `SignalStatus`.
- **Action (proposed):**
  - Rename `SeRuntimeSignal.state` → `lifecycle_state` (or inline the enum values
    `PENDING | ACTIVE | COMPLETED | EXPIRED`).
  - Purge any remaining `status` string usages inside `se-runtime.ts` and tests.
- **Impact:** `se-runtime.ts`, `se-runtime.spec.ts`, `lifecycle.service.ts`.

### TD-4 — Flip backend `strictNullChecks` (PR 2.4b)
- **Source:** PR 2.4a follow-up.
- **Context:** `backend/tsconfig.json` currently has `strictNullChecks: false`,
  `noImplicitAny: false`, `strictBindCallApply: false`,
  `forceConsistentCasingInFileNames: false`, `noFallthroughCasesInSwitch: false`.
  No umbrella `strict: true`. Frontend is already fully strict; backend is not.
- **Expected impact:** 50–200+ new TS errors concentrated in `signals.service.ts`,
  `lifecycle.service.ts`, scanners (payload construction with optional fields),
  webhook controllers (nullable request bodies) and stats aggregation on nullable
  DB columns (`closedAt`, `result`, `se_close_reason`, `pnlPercent`).
- **Approach:**
  1. Flip `strictNullChecks: true` on a throwaway branch, run
     `npx tsc --noEmit 2>&1 | tee /tmp/strict-errors.txt`.
  2. Bucket errors by file and by pattern (nullable field access, implicit any
     params, missing null guards).
  3. Decide: one large PR vs module-by-module split (2.4b-signals,
     2.4b-payments, 2.4b-auth, ...).
  4. Re-plan with real numbers before touching `tsconfig.json` for real.
- **Blocker:** None. Can start whenever scheduled.

### TD-5 — Add backend ESLint with `@typescript-eslint/no-explicit-any` (PR 2.4c)
- **Source:** PR 2.4a follow-up.
- **Context:** Backend has no ESLint config at all (no `.eslintrc*`, no
  `eslint.config.*`). Nothing prevents a future contributor from re-adding
  `as any`. Frontend has one config but doesn't explicitly enable
  `no-explicit-any` (`typescript-eslint`'s `recommended` ships only a warn-level
  variant).
- **Approach:**
  1. Add `liquidityscan-web/backend/eslint.config.mjs` with `@eslint/js` +
     `typescript-eslint` recommended.
  2. Enable `@typescript-eslint/no-explicit-any: 'error'` (start as `warn` if
     residual `as any` hits in non-Prisma files need triage: ~60 remaining hits
     across payments, telegram, mail, binance, tron-scanner and test files).
  3. Add `lint` npm script to `backend/package.json`.
  4. Also consider enabling the rule in `frontend/eslint.config.js` (128 hits
     today, 84 of them in `InteractiveLiveChart.tsx` alone — that file likely
     needs an explicit `/* eslint-disable */` block for chart-lib escape hatches).
- **Blocker:** Better to land *after* TD-4 (strict flags), because strict
  flags surface issues ESLint also catches — avoids churn fixing the same
  errors twice.

### TD-6 — Admin UI "Refund" button for completed payments
- **Source:** PR 2.5 Part A follow-up.
- **Context:** The backend now exposes `PUT /admin/payments/:id/refund` →
  `AdminService.refundCompletedPayment()` (atomic rollback of payment, user
  tier, UserSubscription and affiliate commission). The admin frontend at
  `/admin/payments` currently only surfaces a "Cancel" action, which after
  PR 2.5a calls the renamed `cancelPendingPayment` path and is rejected for
  `status='completed'` payments.
- **Action (proposed):**
  1. Add a "Refund" button in `frontend/src/pages/admin/Payments.tsx` visible
     only when `payment.status === 'completed'`.
  2. Wire it to the new `PUT /admin/payments/:id/refund` endpoint.
  3. Show the resulting `alreadyRefunded` flag distinctly from a fresh refund
     (UX: "already refunded" toast vs "refund successful" toast).
  4. Disable the button for `status in ('refunded', 'cancelled', 'failed',
     'pending')`; keep existing "Cancel" visible only for pending/failed.
- **Blocker:** None. Low-risk UI PR, can be scheduled independently.

### TD-7 — Telegram 409 conflict handling (PR 2.5 Part B)
- **Source:** PR 2.5 Part A follow-up (deferred scope from original PR 2.5).
- **Context:** Two concurrent `TelegramBot` polling loops (bot token reused
  between stale pm2 restart and new instance, or dev + prod pointing at the
  same bot) produce recurring `409 Conflict: terminated by other getUpdates
  request` in logs, noising `/root/.pm2/logs/liquidityscan-api-error.log`
  without actually breaking bot delivery.
- **Action (proposed):**
  1. Detect the 409 in the polling error handler (`telegram.service.ts`
     `onPollingError`), classify it, suppress the noisy log-and-retry storm
     after the first N occurrences (exponential backoff with a cap).
  2. Consider using a distributed lock (Redis SETNX with TTL, or a DB advisory
     lock) so only one API instance runs `bot.startPolling()` at a time;
     others become pure webhook consumers.
  3. Add a unit/integration test that fakes two polling instances and asserts
     only one emits `getUpdates`.
- **Blocker:** Requires decision on Redis availability for the deployment.
  If Redis is not available, DB advisory lock (`pg_try_advisory_lock`) is a
  zero-new-infra alternative.

### TD-8 — Optional `AffiliateReferral.reversedAt` column
- **Source:** PR 2.5 Part A follow-up.
- **Context:** `AffiliateReferral.status = 'CHURNED'` is now a shared terminal
  state reached by either (a) natural subscription-expiry churn or (b) an
  explicit admin-triggered refund reversal. The two cases are currently only
  distinguishable by cross-referencing `Payment.status='refunded'` on the
  associated payment, or by grepping logs for `[AFFILIATE_REVERSAL]` /
  `[AFFILIATE_REVERSAL_UNDERFLOW]` tags.
- **Action (proposed):**
  1. Add an optional `reversedAt DateTime?` column to `AffiliateReferral`.
  2. Populate it in `AdminService.refundCompletedPayment()` when transitioning
     CONVERTED → CHURNED via refund.
  3. Leave it null for natural churn transitions (e.g. future subscription-
     expiry sweep). Makes audit queries 1-hop instead of requiring join on
     Payment.
  4. Surface it in the admin UI alongside the referral row if an affiliate
     dashboard is ever added.
- **Blocker:** None. Low-risk schema additive migration, can land as part of
  a broader affiliate observability PR.

### TD-9 — Remove `--experimental-require-module` Node flag (ESM/CJS debt)
- **Source:** PR 2.5a deploy (commit `daa92f8`).
- **Problem:** `satori-html` is ESM-only; `TelegramService` imports it via the
  sync `require()` chain at module load time. Node 20.18 requires the
  `--experimental-require-module` flag (wired into `ecosystem.config.cjs`
  `NODE_OPTIONS`) to boot the API at all — a fresh `npm run build + pm2
  restart` without the flag hits `ERR_REQUIRE_ESM` deterministically. Makes
  PM2 config depend on experimental Node runtime semantics.
- **Risk:** Future Node upgrade may change or remove the flag's behavior.
  Production depends on an experimental-prefixed feature. Also: any
  contributor who rebuilds dist locally without inheriting this env will
  see a confusing crash.
- **Options:**
  1. Upgrade server Node to >= 22 (`require(ESM)` is default-on and stable).
     Test compatibility of all other deps (Prisma, Nest, Playwright,
     sharp-equivalents) in staging first.
  2. Convert the `satori-html` import in `telegram.service.ts` to dynamic
     `await import('satori-html')` inside the method that actually renders
     image cards. No flag needed; caller becomes async but already is.
  3. Audit whether `satori-html` is still used at all (it was added for
     OG-image/signal-card generation). If feature is off or unused, remove
     the dep entirely — removes the whole class of ESM/CJS boundary bugs.
- **Blocker:** Option 1 needs a server maintenance window + compat testing.
  Option 2 is the cheapest (backend-only code change, one file). Option 3
  requires a product call on whether image cards still ship.
- **Priority:** ~~Medium~~ **High** — **raised after PR 3.1** (see Finding 1
  below). `cookie-parser` hit the exact same TS-default-import / CJS-CJS
  interop pattern that `satori-html` hit in PR 2.5a. Two incidents inside
  the same quarter is a trend, not an outlier. Each new CJS dep with an
  `export =` d.ts is now a deploy-risk item. Resolve before the next
  non-trivial backend dep addition.

### TD-10 — Tighten `JWT_EXPIRES_IN` from 1h to 15m
- **Source:** PR 3.1 compromise.
- **Context:** PR 3.1 landed with `JWT_EXPIRES_IN=1h` to balance
  silent-refresh exercise (~24 refreshes/day/user → enough traffic to
  surface any refresh-flow bug quickly) against blast radius (1 hour is
  still meaningfully shorter than the pre-PR `7d`). Once we have ≥72h of
  stable PR 3.1 operation (no 401 spikes, no refresh-loop incidents,
  observed silent refresh working end-to-end in production browsers),
  tighten to 15m for a typical industry value.
- **Action:** single-line change — `JWT_EXPIRES_IN=15m` in
  `liquidityscan-web/backend/.env` + `pm2 restart liquidityscan-api`.
- **Verification:** decode a freshly-issued access token and assert
  `exp - iat = 900`. Exercise one full silent-refresh cycle in a
  signed-in browser.
- **Blocker:** minimum 72 hours post-PR-3.1 stability.
- **Estimated effort:** 10 minutes.

---

## Findings — PR 3.1 retrospective

### Finding 1 — CJS/ESM default-import interop (second occurrence)
- **Observed:** `cookie-parser` in PR 3.1 produced the same `(0 ,
  module_1.default) is not a function` crash at bootstrap that
  `satori-html` produced in PR 2.5a. Both were fixed inline with the
  `const x = require('x')` escape hatch rather than ESM `import`.
- **Root cause shared across both:** the package's d.ts declares
  `export = x;` (CJS-style single-export), so TS's `import x from 'x'`
  compiles to `x_1.default(...)`, which at runtime reads `undefined`
  because CJS single-export modules don't populate `.default` under
  Node's experimental ESM-in-CJS loader.
- **Action:** elevated **TD-9** from Medium to **High** above. Until TD-9
  is resolved (Node 22 upgrade or per-module dynamic import), any new
  backend CJS dep should be added with:
  1. `npm i` the package,
  2. build immediately (`npm run build`) and `pm2 restart` on the feature
     branch to catch the pattern before merge,
  3. if the `.default is not a function` crash appears, use the
     `require()` form with an eslint-disable comment and a `// TD-9`
     marker.

### Finding 2 — `refreshToken` race condition (fixed in PR 3.1)
- **Observed:** `POST /auth/refresh` returned HTTP 500 with
  `Unique constraint failed on (token)` when the refresh happened within
  the same wall-clock second as the preceding `POST /auth/register` (or
  login, or previous refresh). Reproducible 100% of the time via a
  `register → refresh` curl pair with no intervening sleep.
- **Root cause:** `AuthService.refreshToken()` created the new refresh
  row **before** deleting the old one. JWT `iat` has 1-second resolution,
  so `jwtService.sign({sub, email}, ...)` with the same payload in the
  same second produces a byte-identical token string — which collides on
  `RefreshToken.token @unique`.
- **Latent on master pre-PR-3.1:** dormant because the legacy frontend
  refreshed only on 401, never on page load. PR 3.1's `bootstrapAuth()`
  fires on every navigation, which is fast enough to hit the second
  boundary.
- **Fix:** swapped delete/create order in `auth.service.ts:refreshToken`.
  Covered by 9 new tests in `auth.controller.spec.ts`.
- **Lesson for future PRs:** any change that adds a new trigger of a
  rotating-token flow (e.g. push-notification refresh, cron-driven
  session refresh, SSE reconnect) must be evaluated against same-second
  signing collisions. Prefer either transactional delete-then-create or
  adding a `jti: crypto.randomUUID()` claim to the signed payload so
  every token is unique regardless of wall-clock precision.

