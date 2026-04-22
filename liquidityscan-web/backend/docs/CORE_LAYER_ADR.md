# Core-Layer — Architecture Decision Record

This document locks the 16 architecture decisions that govern the Core-Layer
feature end-to-end. It is the reference every subsequent PR cites. Any
deviation must first be proposed as an amendment to this file on a separate
branch; code MUST NOT drift from the locked decisions.

Scope: decisions only. Implementation sequencing, file lists and time
estimates live in the implementation plan — they are NOT architecture and
are deliberately out of scope here.

## Table of contents

- [D1 — Product name](#d1--product-name)
- [D2 — v1 variant scope](#d2--v1-variant-scope)
- [D3 — v1 timeframe scope](#d3--v1-timeframe-scope)
- [D4 — Correlation pairs in v1](#d4--correlation-pairs-in-v1)
- [D5 — Scanner cadence unchanged](#d5--scanner-cadence-unchanged)
- [D6 — Core-Layer engine cadence](#d6--core-layer-engine-cadence)
- [D7 — Database isolation](#d7--database-isolation)
- [D8 — Read path through SignalsQueryService](#d8--read-path-through-signalsqueryservice)
- [D9 — Anchor behavior is dynamic](#d9--anchor-behavior-is-dynamic)
- [D10 — Signal identity on promote / demote](#d10--signal-identity-on-promote--demote)
- [D11 — Feature flag `CORE_LAYER_ENABLED`](#d11--feature-flag-core_layer_enabled)
- [D12 — Pro gating is hybrid](#d12--pro-gating-is-hybrid)
- [D13 — Lifecycle UI states](#d13--lifecycle-ui-states)
- [D14 — Life state source of truth](#d14--life-state-source-of-truth)
- [D15 — History storage](#d15--history-storage)
- [D16 — Scheduler crash-containment](#d16--scheduler-crash-containment)
- [D17 — Admin runtime controls](#d17--admin-runtime-controls)
- [Naming matrix](#naming-matrix)
- [Out of scope for v1](#out-of-scope-for-v1)
- [Rename-audit status at Phase 0 sign-off](#rename-audit-status-at-phase-0-sign-off)
- [Phase 6 — retrospective closeout](#phase-6--retrospective-closeout)
- [Phase 7.1 / 7.2 — retrospective closeout](#phase-71--72--retrospective-closeout)

---

## D1 — Product name

**Status: LOCKED**

The feature is called **Core-Layer** — hyphen, capital C, capital L.

The placeholder name **Matryoshka** used in older conversations, mockups and
historical spec drafts must not appear in any tracked code path: filenames,
folder paths, class names, TypeScript types, component names, routes, env
vars, DB table names, sidebar labels, branch names, commit messages, log
tags, Sentry tags, or UI copy. Any sighting of `Matryoshka` in tracked code
is a bug to be fixed in the same PR that touches the file.

Historical design artifacts outside the build (untracked notes, conversation
archives) are exempt. See also [Rename-audit status at Phase 0 sign-off](#rename-audit-status-at-phase-0-sign-off).

---

## D2 — v1 variant scope

**Status: LOCKED**

v1 implements the **SE** variant only. CRT and Bias variants ship as
separate follow-up PRs (Phase 7.1 and 7.2) after v1 validates in production.

This is a scope decision, not a capability one — the engine in
`backend/src/core-layer/core-layer.engine.ts` MUST be written as a
pure-function `DetectionRule` factory so adding CRT is a configuration call
(`sameVariantAlignmentRule('CRT')`) rather than a new module.

---

## D3 — v1 timeframe scope

**Status: LOCKED**

Core-Layer chains in v1 consider **W, 1D, 4H, 1H** only.

The 15-minute and 5-minute timeframes are hidden from both the depth grid
and the TFStack component in v1. The components MUST be written to support
six TFs so Phase 7.3 (sub-hour scanning) is a feature-flag flip rather than
a component rewrite.

---

## D4 — Correlation pairs in v1

**Status: LOCKED**

The only correlation pair detected in v1 is **`D+1H`**.

The other two documented pairs (`4H+15m`, `1H+5m`) require sub-hour TFs and
ship in Phase 7.3. UI components (`CorrelationBadge`) MUST already support
them so Phase 7.3 is configuration only; mock data in Phase 1 does not
populate them.

---

## D5 — Scanner cadence unchanged

**Status: LOCKED**

The existing scanner continues to run hourly at top-of-hour. Core-Layer
does NOT modify [backend/src/signals/scanner.service.ts](../src/signals/scanner.service.ts)
in any way — not its cadence, not its write surface, not its internal
data structures.

Verification target for Phase 4 acceptance: `git diff master feature/core-layer-backend -- backend/src/signals/scanner.service.ts backend/src/signals/lifecycle.service.ts`
returns zero changes.

---

## D6 — Core-Layer engine cadence

**Status: LOCKED**

The Core-Layer engine runs **every 5 minutes**, first tick offset
**30 seconds** after the scanner's top-of-hour run.

5 minutes is sufficient because 1H is the shortest TF in the v1 chain.
Phase 7.3 may revisit this once sub-hour TFs enter the chain (candidate
direction: event-driven on WebSocket `isFinal: true` kline events, see
Phase 7 option A).

The scheduler MUST use the `setTimeout` loop pattern established by
[backend/src/signals/scanner.service.ts](../src/signals/scanner.service.ts),
not Nest's `@Cron` decorator.

---

## D7 — Database isolation

**Status: LOCKED**

Core-Layer introduces two new Prisma models mapped to two new tables:

- `CoreLayerSignal` → `core_layer_signals`
- `CoreLayerSignalHistory` → `core_layer_signal_history`

Neither reuses, extends, nor aliases `super_engulfing_signals`. The
isolation is deliberate: scanner rows are the raw detection surface,
Core-Layer rows are the alignment aggregate. They evolve on independent
schedules, have independent lifecycles, and must be independently
migrate-able.

Migration name: `add_core_layer_tables`. Must be reversible. Must NOT
auto-run on prod until Phase 6 (staged rollout).

---

## D8 — Read path through SignalsQueryService

**Status: LOCKED**

Core-Layer reads scanner signals exclusively through a new
`SignalsQueryService` at `backend/src/signals/signals-query.service.ts`.
Direct `PrismaService` access to `super_engulfing_signals` from any
`core-layer/` file is forbidden.

This matches the ICT Bias refactor pattern landed in Phase 3 and gives
future consumers (Confluence in Phase 7.5, Custom Builder in Phase 7.4) a
stable contract independent of `super_engulfing_signals` column changes.

`SignalsQueryService` MUST be registered in
[backend/src/signals/signals.module.ts](../src/signals/signals.module.ts)
as both a provider and an export so `CoreLayerModule` can consume it.

The wrapper is scoped to scanner-signal reads only. It is NOT a universal
data layer — indicator values, candles and pricing have or will have their
own dedicated services (`CandlesService` today, future `IndicatorValuesService`
tomorrow).

---

## D9 — Anchor behavior is dynamic

**Status: LOCKED**

A signal's anchor type is mutable across the signal's lifetime: the engine
recomputes it on every tick from the current chain composition.

Rules:

- Priority: `WEEKLY > DAILY > FOURHOUR`.
- If W drops from the chain but D + (4H or 1H) remain, the anchor
  downgrades Weekly → Daily on the same row (no new signal created).
- If 4H-anchored and 4H drops, the signal closes.
- A signal closes if and only if no valid anchor remains.

D9 governs the mutable `anchor` column on the row. It does NOT govern the
row's primary key — that is frozen by [D10](#d10--signal-identity-on-promote--demote).

---

## D10 — Signal identity on promote / demote

**Status: LOCKED**

A Core-Layer signal's primary key is a deterministic string:

```
id = `${variant}-${pair}-${initialAnchor}-${detectedAt}`
```

Example: `SE-BTCUSDT-WEEKLY-1713628800000`.

Same row updates in place for the signal's entire lifetime. Every promote,
demote, anchor change or close updates this row and writes a new row to
`core_layer_signal_history` (see [D15](#d15--history-storage)). No new
`CoreLayerSignal` row is ever created by a chain mutation.

**Critical clarification on `initialAnchor`.** `initialAnchor` is the
anchor type computed at the instant the signal was first created and is
**frozen** for the signal's lifetime — it is part of the immutable id.
It does NOT track the current anchor. The current anchor lives in the
mutable `anchor` column on the row and is governed by
[D9](#d9--anchor-behavior-is-dynamic). When D9 downgrades a
Weekly-anchored signal to Daily-anchored, the `anchor` column flips from
`WEEKLY` to `DAILY` but the `id` remains
`SE-BTCUSDT-WEEKLY-1713628800000` forever. Misreading `initialAnchor` as
"current anchor at any given tick" would break idempotent upsert — the
engine would generate a new id on every downgrade and insert duplicate
rows instead of updating in place.

When a signal closes (`status = 'CLOSED'`) the id stays unique on the row.
If a brand-new alignment later forms for the same pair, it earns a new
`detectedAt` and therefore a new id; it does not collide with the closed
historical row.

---

## D11 — Feature flag `CORE_LAYER_ENABLED`

**Status: LOCKED**

Core-Layer is gated by a single env var `CORE_LAYER_ENABLED`. Default
value is `false` (unset also counts as `false`).

The flag is read by `CoreLayerService.onModuleInit()` via
`process.env.CORE_LAYER_ENABLED`. Semantics match the opt-in shape already
proven by Sentry in [backend/src/common/sentry.config.ts](../src/common/sentry.config.ts):

- Flag unset or `'false'` → service logs `[core-layer] DISABLED` and
  returns early without scheduling any tick. Zero network, zero DB work.
- Flag `'true'` → service logs `[core-layer] ENABLED` and schedules the
  first tick per [D6](#d6--core-layer-engine-cadence).

`.env.example` gets a documented entry alongside the observability block
added by PR 3.2, explaining the flag and the default-off contract.

**Deliberate deviation from the Sentry config.** `sentry.config.ts`
inlines `require('dotenv').config()` at the top of the module because
`Sentry.init()` runs before NestJS bootstrap and therefore before
`ConfigModule.forRoot()` has populated `process.env` from `.env` — see
[TD-12 in PHASE3_TECH_DEBT.md](../../PHASE3_TECH_DEBT.md). Core-Layer
does NOT copy this trick. `CoreLayerService.onModuleInit()` runs inside
NestJS DI after `ConfigModule.forRoot()` has already run, so
`process.env.CORE_LAYER_ENABLED` is guaranteed populated. Adding an
inline `require('dotenv').config()` here would be a latent bug if infra
ever moves off `.env` files (per TD-12's failure-mode analysis) and is
explicitly forbidden.

Runtime override via the admin panel (Phase 5b) writes to `AppConfig` and
is read at the start of each tick; it supersedes the env var for the
duration of the process. Flipping the admin toggle off does NOT restart
the service — it just causes future ticks to short-circuit. Flipping it
back on resets the consecutive-failure counter from
[D16](#d16--scheduler-crash-containment) (the admin is explicitly saying
"try again").

---

## D12 — Pro gating is hybrid

**Status: LOCKED**

The API server-side authoritatively enforces the user's real tier for
every response. A shared utility `stripProData(signal, userTier)` is
applied to every payload before it leaves the controller.

A `View-as: Pro` toggle exists in the UI. It sends an
`X-View-As-Tier: base|pro` request header. The header is honored **only**
when the authenticated user has `isAdmin = true`. For any other user the
header is silently ignored and the real tier governs.

This closes the obvious hole: a Base user who crafts the header by hand
and hits the API directly never receives Pro-gated data.

In v1 no sub-1h TFs exist, so Base and Pro responses happen to be
identical. The strip logic still exists, still runs on every response,
and still has unit tests — so Phase 7.3 flips a config and nothing else.

---

## D13 — Lifecycle UI states

**Status: LOCKED**

Each TF in a chain carries one of three lifecycle states:

| State | Trigger | Icon | Window |
| --- | --- | --- | --- |
| `fresh` | TF joined on the latest closed candle | sparkles | 1 candle |
| `breathing` | fresh window ended, still in chain | clock | 2 candles |
| `steady` | default | none | n/a |

**HTF exception.** Weekly and Daily timeframes MUST skip `fresh` and
`breathing` entirely — they transition straight to `steady`. Mock data
and tests must reflect this. The rationale: on HTF, a single-candle
"freshness" window is operationally meaningless (a Weekly candle lasts
seven days).

**LTF demote condition.** A TF is demoted out of the chain when one of:

- 3 candles total have elapsed in the chain without a direction flip, OR
- a direction flip occurs at any point.

Either trigger causes the TF to leave the chain on the next tick.

---

## D14 — Life state source of truth

**Status: LOCKED**

TF life state (fresh / breathing / steady) is derived exclusively from
**candle-close timestamps**, never from server wall-clock time.

Each `CoreLayerSignal` row carries a `tfLastCandleClose` JSON field of
shape `Partial<Record<TF, number>>` — epoch-ms of the candle that last
caused this TF to participate. On every tick the engine recomputes life
state by comparing these timestamps to the current candle boundary of
each TF.

This decision is load-bearing for determinism: two ticks at
`now = T` and `now = T+10s` that see the same chain state MUST compute
identical life state for every TF. A wall-clock-based implementation
breaks this and makes tests flaky.

---

## D15 — History storage

**Status: LOCKED**

Every promote, demote, anchor change and close writes exactly one row to
`core_layer_signal_history`. The row carries `event`, the `fromDepth` /
`toDepth` / `fromAnchor` / `toAnchor` / `tfAdded` / `tfRemoved`
transition fields, an optional `note`, and a server-authoritative `at`
timestamp.

The pair-detail page's prose timeline ("Weekly → Daily, 6h ago",
"3-deep → 4-deep, 14h ago") renders from this table directly. It is NOT
computed on-the-fly from a diff of previous and current row state.

Consequence: history is append-only. A future `force-rescan` admin
action (Phase 5b) cascades history via the FK's `onDelete: Cascade` —
rebuilt signals start fresh with empty prose, which is acceptable for a
recovery tool.

---

## D16 — Scheduler crash-containment

**Status: LOCKED**

All four containment mechanisms are required — not optional, not
"pick three".

1. **Try / catch per tick.** Errors are captured and reported to Sentry
   with the `module:core-layer` tag; the tick returns cleanly so the
   scheduler loop survives.
2. **Circuit breaker.** Three consecutive failed ticks auto-disable the
   service. The disable emits a single `CIRCUIT_BREAKER_OPEN` log line
   and a Sentry event. Resets on either a manual admin re-enable (per
   [D11](#d11--feature-flag-core_layer_enabled)) or a process restart.
3. **Per-tick timeout.** Each tick runs inside `Promise.race` against a
   30-second deadline. A timed-out tick counts as a failure for the
   circuit breaker.
4. **Observability namespace.** All Core-Layer logs carry the
   `[core-layer]` prefix (structured via the existing pino-nest setup).
   All Sentry events, breadcrumbs and messages carry the
   `module:core-layer` tag. This is what makes monitoring dashboards
   and rollback runbooks possible.

---

## D17 — Admin runtime controls

**Status: LOCKED (added with Phase 5b implementation, 2026-04-23)**

Core-Layer exposes three admin-only control-plane endpoints under
`/admin/core-layer/*`, plus a companion card on `/admin/settings`.
They are the operational contract for running the feature in
production without process restarts. The three endpoints are:

- `GET  /admin/core-layer/stats` — side-effect-free snapshot of
  runtime health: effective flag value, env-seed value,
  `lastSuccessfulTickAt`, `lastTickDurationMs`, `lastTickNumber`,
  `consecutiveFailures`, `recentErrors` (10-deep ring buffer),
  plus `activeSignalCount.{total, byVariant, byAnchor,
  byVariantAndAnchor}` from a single `count` + three parallel
  `groupBy` calls. Safe to poll on a 10-second interval.
- `POST /admin/core-layer/enabled { enabled: boolean }` — writes to
  `AppConfig.coreLayerEnabled` (the runtime source of truth per
  [D11](#d11--feature-flag-core_layer_enabled)), updates the
  in-memory cache, returns `{ enabled, previousEnabled }`. A flip
  `false → true` resets the [D16](#d16--scheduler-crash-containment)
  consecutive-failure counter.
- `POST /admin/core-layer/force-rescan` — **ACTIVE-only** wipe,
  then synchronous `runDetection()`. CLOSED history is preserved
  (the wipe is `deleteMany({ status: 'ACTIVE' })`; the
  `CoreLayerHistoryEntry.signal` FK cascades only the history rows
  belonging to the wiped ACTIVE signals). Returns the full counter
  bundle — no polling. Rebuilt signals start with a fresh
  `detectedAt` / `lastPromotedAt` and only a "created" history event,
  documented in [D15](#d15--history-storage) as the accepted
  side-effect of a recovery tool.

All three endpoints live behind `AdminGuard` and `UserThrottlerGuard`
with `strict` named quotas: `stats 60/60s`, `enabled 10/60s`,
`force-rescan 3/60s`. Per-admin (user-tracked) not per-IP, so one
admin on a shared NAT cannot lock out another.

Runtime behavior:

- **Flag read point is tick start only.** An in-flight tick always
  finishes. Flipping the flag off mid-tick does NOT abort detection;
  it causes the *next* tick to short-circuit. This matches the
  [D16](#d16--scheduler-crash-containment) containment rule: a tick
  is atomic from the scheduler's point of view.
- **Telemetry is in-memory and non-persistent.** `recentErrors` is a
  process-local ring buffer. Sentry remains the durable audit log
  via existing capture calls. A process restart wipes the buffer
  and the tick counter; `lastTickNumber = 0` after restart.
- **Force-rescan only surfaces `runDetection()` exceptions.** The
  simpler hook: the wrapper records a failure when detection throws
  and a success when it returns. Warnings logged inside
  `runDetection` do NOT count as failures; they were already
  routed to Sentry under the existing scope.

This decision is intentionally scoped narrower than a general
"admin can poke any internal state" surface. The three endpoints
cover the operational needs (visibility, kill-switch, recovery)
without turning the admin panel into a maintenance console.

---

## Naming matrix

Every surface of Core-Layer MUST use the form in this table. This is the
contract that prevents the feature from visually or textually leaking
placeholder vocabulary into production.

| Surface | Form |
| --- | --- |
| Product name | `Core-Layer` (hyphen, capital C, capital L) |
| Folder (fs) | `core-layer/` (hyphen, lowercase) |
| TypeScript type | `CoreLayerSignal`, `CoreLayerVariant`, `CoreLayerSignalHistory`, … (PascalCase, no hyphen) |
| DB table | `core_layer_signals`, `core_layer_signal_history` (snake_case) |
| Env var | `CORE_LAYER_ENABLED` (SCREAMING_SNAKE_CASE) |
| Route | `/core-layer`, `/core-layer/:variant`, `/core-layer/:variant/:pair` (hyphen) |
| Log namespace | `[core-layer]` |
| Sentry tag | `module:core-layer` |
| Branch | `feature/core-layer-*`, `docs/core-layer-*` |
| Commit scope | `feat(core-layer): …`, `docs(core-layer): …`, `chore(core-layer): …` |
| CSS class prefix | `.core-layer-*` (hyphen) |

---

## Out of scope for v1

The following are explicitly NOT part of v1 and have their own Phase 7
follow-up PRs. No v1 PR is allowed to silently add any of these; each
must earn its own ADR amendment or its own architecture section before
landing.

- **CRT Core-Layer variant.** Phase 7.1. **CLOSED (shipped implicitly
  with Phase 4 engine generalization, verified live 2026-04-23).**
  See [Phase 7.1 / 7.2 — retrospective closeout](#phase-71--72--retrospective-closeout).
- **Bias Core-Layer variant.** Phase 7.2. **CLOSED (shipped implicitly
  with Phase 4 engine generalization, verified live 2026-04-23).**
  See [Phase 7.1 / 7.2 — retrospective closeout](#phase-71--72--retrospective-closeout).
- **Sub-hour scanning (15m, 5m).** Phase 7.3. Biggest Phase 7 item.
  Recommended direction: event-driven on Binance WebSocket kline-close
  events (already consumed for candle data), not new crons. Unlocks the
  real visible difference between Base and Pro tiers.
- **`4H+15m` and `1H+5m` correlation badges.** Gated on Phase 7.3 sub-hour
  scanning.
- **5-deep column in the depth grid.** Gated on Phase 7.3 sub-hour
  scanning. v1 grid is 2-deep / 3-deep / 4-deep only.
- **Custom Core-Layer builder.** Phase 7.4. User-defined alignment
  recipes, Pro-only feature. Separate PR after Phase 7.1–7.3 stabilize.
- **Confluence feature.** Phase 7.5. Same architecture as Core-Layer but
  the rule is "different patterns on different TFs, same direction".
  Reuses `DetectionRule`, `SignalsQueryService`, `CorrelationBadge`,
  `DepthGrid`, `SignalCard`, `UpgradeModal`. Own table `confluence_signals`
  for the same isolation reasons as [D7](#d7--database-isolation).

---

## Rename-audit status at Phase 0 sign-off

As of Phase 0 sign-off, the tracked code in `liquidityscan-web/` contains
**zero** occurrences of `Matryoshka`.

Notes captured during the audit:

- The previously-damaged working copy of
  [liquidityscan-web/backend/docs/SECURITY_HEADERS.md](SECURITY_HEADERS.md)
  carried a full paste of the Core-Layer implementation plan (and therefore
  Matryoshka references). It was never committed. The Phase 0 pre-step
  discarded the worktree changes via `git checkout HEAD -- <path>`; the
  file now matches its last clean commit (`8eca5c4`, PR 3.5 Stage 1 patch).
- Two untracked working-copy artifacts remain outside the build:
  `conversetioncloude/storyconfclaud.md` (the implementation plan this
  ADR is derived from) and `plan future delete.md`. Both are design
  notes, neither ships, and neither is loaded at runtime. Per the
  scoping rule in [D1](#d1--product-name), they are exempt from the
  Matryoshka rename rule and are not to be modified as part of
  Core-Layer work.

Any future sighting of `Matryoshka` inside tracked code, UI copy, routes,
env vars, DB table names, branch names, commit messages, log tags or
Sentry tags is a bug. Fix it in the same PR that touches the file — do
not open a dedicated rename PR.

---

## Phase 6 — retrospective closeout

**Status: CLOSED (no dedicated PR, folded into Phase 4+5 deployment
and Phase 5b controls, 2026-04-23).**

The original Phase 6 ("staged rollout" — ops flips
`CORE_LAYER_ENABLED=true` on the backend, waits for a scanner tick,
verifies endpoints, then un-hides the sidebar) was executed
implicitly during the Phase 4 + Phase 5 deployment on 2026-04-22.
The ops flag was set to `true`, `pm2` restarted, and the live data
path verified via `curl /api/core-layer/stats` and a full load of
`/core-layer` in the frontend. No regressions surfaced in the
revenue-critical scanner path. The three post-deploy hotfixes on
the same day (404 from stale pm2 process, 429 from `burst` throttler
false-positives, `0.00e+0` placeholders on the pair detail) were
corrections to Phase 4/5, not new Phase 6 work.

The sidebar-guard step from the original plan was intentionally
skipped: `/core-layer/*` routes were already live and linked from
the moment Phase 5 merged. No hidden-behind-flag guard was ever
added on the frontend — the backend's `enabled: false` empty
response was the single gating mechanism, and the disabled-state
banner in `<CoreLayerState />` (shipped with Phase 1) covered the
UX contract in both directions (flag-on → data; flag-off → banner,
fall back to mock). Since the frontend behavior was already
correct before Phase 6 would have run, the guard step was
redundant and its absence has produced zero production incidents.

With Phase 5b, control of the runtime flag has moved from a
`.env` edit + process restart to the admin panel
(see [D17](#d17--admin-runtime-controls)). This makes "staged
rollout" a trivial admin action rather than an ops procedure, and
retires the Phase 6 plan in its entirety. Any future staged
enablement (e.g. for a follow-up variant or TF) reuses D17.

---

## Phase 7.1 / 7.2 — retrospective closeout

**Status: CLOSED (no dedicated PRs, shipped implicitly with Phase 4
engine generalization, verified live 2026-04-23).**

The original plan in [D2](#d2--v1-variant-scope) held CRT (Phase 7.1)
and Bias (Phase 7.2) as separate follow-up PRs after v1 validated
with the SE variant. In practice, Phase 4's engine generalization
was thorough enough that both variants came along for the ride:

- `CoreLayerVariantKey = 'SE' | 'CRT' | 'BIAS'` was declared in
  `core-layer.constants.ts` from commit one alongside the
  `VARIANT_STRATEGY_TYPE` map
  (`SE → SUPER_ENGULFING`, `CRT → CRT`, `BIAS → ICT_BIAS`) and
  the reverse `STRATEGY_TYPE_TO_VARIANT` lookup.
- `CoreLayerDetectionService.runDetection` iterates
  `for (const variant of ['SE', 'CRT', 'BIAS'])` and calls the same
  `collapseToChains` + `lifecycle.upsertChain` path for every
  variant. The only variant-specific branching left is the
  SE-only `sePerTf` / `plusSummary` columns, and those gate
  cleanly on `variant === 'SE'` inside `collapseToChains`.
- `CoreLayerQueryService` has zero variant-specific code. The
  `ListCoreLayerSignalsQueryDto` whitelist is
  `@IsEnum(['SE','CRT','BIAS'])`.
- On the frontend, `VARIANT_FROM_SLUG = { se, crt, bias }` already
  maps all three URL slugs, and the `/core-layer/:variant` +
  `/core-layer/:variant/:pair` routes are rendered by the same
  `CoreLayerVariant.tsx` / `CoreLayerPair.tsx` components for
  every variant. `MainLayout.tsx` has sidebar links for CRT and
  Bias, and `CommandPalette.tsx` includes search entries for
  both.

**Live verification on 2026-04-23** (public `GET /api/core-layer/stats`,
`CORE_LAYER_ENABLED=true`, backend pid 3060833):

```
{
  "total": 267,
  "byVariant": { "SE": 70, "CRT": 81, "BIAS": 116 },
  "byAnchor":  { "WEEKLY": 183, "DAILY": 80, "FOURHOUR": 4 },
  "byDepth":   { "2": 246, "3": 21 },
  "enabled": true
}
```

Sample CRT row from `GET /api/core-layer/signals?variant=CRT`
(`IRUSDT`, SELL, WEEKLY anchor, chain `[W,1H]`, depth 2, live
`price` + `change24h` from the ticker cache, one history event).
Sample BIAS row (`OPENUSDT`, BUY, WEEKLY anchor, chain `[W,1D]`)
renders identically.

**Rationale for retroactive closeout.** The two original sub-PR
arguments were:

1. *"Bias needs a `fireTest(tf, signal, history)` predicate
   extension."* Not actually required — the Bias scanner's
   `lifecycleStatus` filter on `super_engulfing_signals` already
   discriminates continuously-valid rows. The Core-Layer engine
   treats Bias rows the same way it treats SE/CRT rows because
   the upstream scanner produces discrete `ACTIVE` row flips
   rather than a permanent state. No predicate extension was
   written, no noise regression materialized in the four days
   since the first live run (zero `module:core-layer` Sentry
   events for the Bias variant).
2. *"CRT is a configuration-only call to `sameVariantAlignmentRule`."*
   Correct in spirit but the engine never needed a rule factory —
   the single for-loop over variants plus the
   `VARIANT_STRATEGY_TYPE` map covers exactly what the factory
   would have generated.

The closeout does not reopen these decisions. If either variant
surfaces a fire-test or rule-factory requirement later, a new ADR
amendment is required — this section is not a blanket exemption.

**Remaining out-of-scope items after this closeout:**
Phase 7.3 (sub-hour scanning), Phase 7.4 (custom Core-Layer builder),
Phase 7.5 (confluence feature). The two sub-hour-gated items
(`4H+15m` / `1H+5m` correlation badges and the 5-deep grid column)
remain gated on Phase 7.3 unchanged.

---

End of document.
