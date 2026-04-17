# Frontend overview

## `main.tsx`
**File:** [`frontend/src/main.tsx`](../../../frontend/src/main.tsx):1-20  
**Kind:** entry script  

**Purpose:** Mount React root; in production call `initMicrosoftClarity` from [`lib/clarity.ts`](../../../frontend/src/lib/clarity.ts).

---

## `App.tsx`
**File:** [`frontend/src/App.tsx`](../../../frontend/src/App.tsx):87-210  

### `AppRoutes`
**Kind:** function component  
**Purpose:** Defines all routes: public landing, guest-only login/register, OAuth callback shell, authenticated `MainLayout` routes, admin nested routes, catch-all redirect.

**Notable wrappers:** `OAuthHandler`, `CommandPalette`, `AnimatePresence` on routes, `RequireAuth` / `GuestOnlyRoute`, lazy-loaded pages with `Suspense` + `NeonLoader`.

### `App`
**Purpose:** `ErrorBoundary` → `HelmetProvider` → `QueryClientProvider` (TanStack Query, 5m stale, auth-aware retry) → `ThemeProvider` → `BrowserRouter` → `ClarityIdentifyBridge`, `LaunchPromoBanner`, `Suspense`, `AppRoutes`, `Toaster` (react-hot-toast styling).

### `queryClient`
**Purpose:** Default React Query options; `AuthExpiredError` disables retry spam.

---

## Build / config
- [`vite.config.ts`](../../../frontend/vite.config.ts) — Vite bundler, env, proxy if any.
- [`tailwind.config.js`](../../../frontend/tailwind.config.js) — design tokens.
- [`tsconfig.json`](../../../frontend/tsconfig.json) — TS paths.

**API base:** `VITE_API_URL` or `/api` in prod / same-origin; dev default `http://localhost:3002/api` — see `getApiBaseUrl` in [`userApi.ts`](../../../frontend/src/services/userApi.ts).
