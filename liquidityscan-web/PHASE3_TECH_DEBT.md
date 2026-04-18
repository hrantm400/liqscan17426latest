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
