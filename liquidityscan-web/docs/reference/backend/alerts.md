# Alerts module

## `strategy-alert-config`
**File:** [`backend/src/alerts/strategy-alert-config.ts`](../../../backend/src/alerts/strategy-alert-config.ts)  

**Exports:**
- `STRATEGY_ALERT_DEFINITIONS` — value, label, icon, color, description, **allowedTimeframes** per strategy.
- `normalizeTimeframeForAlerts` — maps aliases (`4H` → `4h`, etc.).
- `normalizeStrategyTypeForAlerts` — maps `RSI_DIVERGENCE` → `RSIDIVERGENCE`.
- `getStrategyAlertOptionsForApi` / `getStrategyDefinition` / `expandStrategyKeysForSubscriptionQuery` / `normalizeSubscriptionTimeframes` — used by API and Telegram filtering.

## `AlertsService`
**File:** [`backend/src/alerts/alerts.service.ts`](../../../backend/src/alerts/alerts.service.ts):15+  

### `getUserAlerts`
**Purpose:** List `AlertSubscription` for user.

### `getStrategyOptions`
**Purpose:** `{ strategies: getStrategyAlertOptionsForApi() }`.

### `createAlert` / `updateAlert` / `deleteAlert`
**Purpose:** CRUD with validation; `PricingService.canAccessSymbol` for non-PRO symbols; unique constraint handling.

### `getTelegramId` / `saveTelegramId` / `clearTelegramId` / `createTelegramDeepLink` / `linkTelegramChatFromCode`
**Purpose:** Telegram account linking and deep-link code lifecycle (`TelegramLinkCode` table).

## `AlertsController`
**File:** [`backend/src/alerts/alerts.controller.ts`](../../../backend/src/alerts/alerts.controller.ts)  
**Purpose:** REST routes mirroring user alert operations — some duplicated under `/users/me/*` for proxy compatibility.
