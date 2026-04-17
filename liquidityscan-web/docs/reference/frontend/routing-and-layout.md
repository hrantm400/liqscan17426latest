# Routing, layout, and auth shell

## `MainLayout`
**File:** [`frontend/src/components/MainLayout.tsx`](../../../frontend/src/components/MainLayout.tsx)  
**Purpose:** Authenticated app chrome: sidebar, header, mobile nav, outlet for child routes, floating chart manager, global pollers.

## `Header` / `Sidebar` / `MobileMenu` / `MobileHeader` / `MobileBottomNav`
**Files:** [`Header.tsx`](../../../frontend/src/components/Header.tsx), [`Sidebar.tsx`](../../../frontend/src/components/Sidebar.tsx), [`MobileMenu.tsx`](../../../frontend/src/components/MobileMenu.tsx), [`layout/MobileHeader.tsx`](../../../frontend/src/components/layout/MobileHeader.tsx), [`layout/MobileBottomNav.tsx`](../../../frontend/src/components/layout/MobileBottomNav.tsx)  
**Purpose:** Navigation, branding, responsive behavior.

## `AuthRoutes`
**File:** [`frontend/src/components/auth/AuthRoutes.tsx`](../../../frontend/src/components/auth/AuthRoutes.tsx)  

### `RequireAuth`
**Purpose:** Redirect unauthenticated users to `/login`; typically wraps protected route trees.

### `GuestOnlyRoute`
**Purpose:** Redirect logged-in users away from login/register to dashboard.

## `OAuthHandler`
**File:** [`frontend/src/components/OAuthHandler.tsx`](../../../frontend/src/components/OAuthHandler.tsx)  
**Purpose:** Reads `/oauth-callback` query `code`; exchanges via `POST /api/auth/oauth/exchange`; stores tokens in auth store; navigates to app.

## `ErrorBoundary`
**File:** [`frontend/src/components/ErrorBoundary.tsx`](../../../frontend/src/components/ErrorBoundary.tsx)  
**Purpose:** Catches React render errors in subtree.

## `CommandPalette`
**File:** [`frontend/src/components/shared/CommandPalette.tsx`](../../../frontend/src/components/shared/CommandPalette.tsx)  
**Purpose:** Keyboard-driven navigation / actions.

## `LaunchPromoBanner`
**File:** [`frontend/src/components/shared/LaunchPromoBanner.tsx`](../../../frontend/src/components/shared/LaunchPromoBanner.tsx)  
**Purpose:** Shows promo when `GET /api/public/site-status` has `launchPromoFullAccess` (or related flags).

## `PageHeader` / `TimezoneGate`
**Files:** [`layout/PageHeader.tsx`](../../../frontend/src/components/layout/PageHeader.tsx), [`onboarding/TimezoneGate.tsx`](../../../frontend/src/components/onboarding/TimezoneGate.tsx)  
**Purpose:** Page titles; optional timezone selection gate for new users.
