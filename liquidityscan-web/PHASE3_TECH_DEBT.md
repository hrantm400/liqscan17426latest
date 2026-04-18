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
