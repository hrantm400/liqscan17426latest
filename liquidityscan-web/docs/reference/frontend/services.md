# Frontend services (API + WebSocket)

## `getApiBaseUrl`
**File:** [`frontend/src/services/userApi.ts`](../../../frontend/src/services/userApi.ts):4-17  
**Purpose:** Resolve API prefix: `VITE_API_URL`, or `/api` in prod/non-localhost, or `http://localhost:3002/api` in dev.

## `getStoredAccessToken`
**File:** [`frontend/src/services/userApi.ts`](../../../frontend/src/services/userApi.ts):27-38  
**Purpose:** Read JWT from persisted Zustand `auth-storage` or legacy `localStorage.token`.

## `ApiClient` class
**File:** [`frontend/src/services/userApi.ts`](../../../frontend/src/services/userApi.ts):42+  
**Purpose:** Central HTTP client with automatic **refresh token** rotation on 401, methods for auth (`login`, `register`, `getProfile`, …), users, payments, pricing, admin when exposed.

**Key patterns:** `fetch` with JSON; attaches `Authorization`; handles `AuthExpiredError`; dedupes concurrent refresh via `refreshInFlight`.

## `signalsApi.ts`
**File:** [`frontend/src/services/signalsApi.ts`](../../../frontend/src/services/signalsApi.ts)  

| Export | Purpose |
|--------|---------|
| `fetchSignals` | GET `/signals` with optional strategy, limit, minVolume |
| `fetchRsiDivergenceSignalsUnion` | Merge RSIDIVERGENCE + RSI_DIVERGENCE |
| `fetchSignalById` | GET `/signals/:id` |
| `scanAll` | POST `/signals/scan` |
| Additional helpers | Daily recap, market overview, live bias, stats, CISD client helpers — see file |

## `candles.ts`
**File:** [`frontend/src/services/candles.ts`](../../../frontend/src/services/candles.ts)  
**Purpose:** Fetch klines for charts (REST paths aligned with `CandlesController`).

## `WebSocketService` / `wsService`
**File:** [`frontend/src/services/websocket.ts`](../../../frontend/src/services/websocket.ts):4+  

### `connect`
**Purpose:** Lazy `socket.io-client` to same origin or `VITE_API_URL`; `auth: { token }`; path `/socket.io`.

### `subscribeToSymbol` / `unsubscribeFromSymbol`
**Purpose:** Emit `subscribe:symbol` / `unsubscribe:symbol` with `{ symbol, timeframe }`.

### `on` / `off` / `disconnect`
**Purpose:** Event fan-out for `candle:update` and cleanup; `authStore.logout` calls `disconnect`.
