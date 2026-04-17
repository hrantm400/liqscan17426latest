# Zustand stores

## `useAuthStore`
**File:** [`frontend/src/store/authStore.ts`](../../../frontend/src/store/authStore.ts):18-74  
**Middleware:** `persist` with name `auth-storage`.

| Field / action | Purpose |
|----------------|---------|
| `user`, `token`, `refreshToken` | Session |
| `isAuthenticated`, `isAdmin` | Derived flags |
| `setUser`, `setToken`, `setRefreshToken` | Updates; `setToken` syncs `localStorage.token` |
| `logout` | Clears store, `wsService.disconnect`, removes storage keys |

## `useFloatingChartStore`
**File:** [`frontend/src/store/floatingChartStore.ts`](../../../frontend/src/store/floatingChartStore.ts)  
**Purpose:** Multi-window floating chart state (symbol, timeframe, position).

## `useNotificationStore`
**File:** [`frontend/src/store/notificationStore.ts`](../../../frontend/src/store/notificationStore.ts)  
**Purpose:** In-app notification queue / read state.

## `useWatchlistStore`
**File:** [`frontend/src/store/watchlistStore.ts`](../../../frontend/src/store/watchlistStore.ts)  
**Purpose:** Persisted favorite symbols / pairs for Watchlist page.
