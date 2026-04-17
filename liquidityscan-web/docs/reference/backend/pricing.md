# Pricing module

## `PricingService`
**File:** [`backend/src/pricing/pricing.service.ts`](../../../backend/src/pricing/pricing.service.ts):46+  

**Purpose:** Single source of truth for **tier gating**: FREE vs paid, launch promo full access, per-feature grants (`FeatureAccess`), symbol allowlists (`FREE_SYMBOLS`), daily RSI/bias quotas, Telegram access.

### `cronExpireOverdueSubscriptions`
**Schedule:** `@Cron('0 0 * * *')` — midnight; calls `expireOverdueSubscriptions`.

### `getTierInfo`
**Signature:** `async getTierInfo(userId: string): Promise<TierInfo>`  
**Purpose:** Load user; optional daily quota reset; compute `launchPromoActive`, `hasFullProductAccess`, `features` array from grants or full unlock; return quotas, symbols allowed, history window, etc.

### `canAccessSymbol` / `consumeRsiQuota` / `consumeBiasQuota` (and related)
**Purpose:** Enforce FREE tier symbol list and daily limits — see full file for method names.

### `resetDailyQuotaIfNeeded`
**Purpose:** Rolling reset using `dailyQuotaResetAt` on `User`.

**Consumers:** `AlertsService` (symbol access), frontend hooks (`useTierGating`), API controllers exposing tier info.

## `PricingController`
**File:** [`backend/src/pricing/pricing.controller.ts`](../../../backend/src/pricing/pricing.controller.ts)  
**Purpose:** HTTP endpoints for tier info — verify paths in source.
