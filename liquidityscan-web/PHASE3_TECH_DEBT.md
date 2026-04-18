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
