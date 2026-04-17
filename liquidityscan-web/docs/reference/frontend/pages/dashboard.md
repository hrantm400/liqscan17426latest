# Page: Dashboard

**File:** [`frontend/src/pages/Dashboard.tsx`](../../../../frontend/src/pages/Dashboard.tsx)  
**Route:** `/dashboard` (inside `MainLayout` + `RequireAuth`)

**Purpose:** Main authenticated home: summary cards, quick links to monitors, recent signals or stats (per implementation).

**Data:** Typically React Query + `signalsApi` / user profile; uses tier hooks for gated CTAs.

**Related:** [`MainLayout`](../routing-and-layout.md), [`useTierGating`](../hooks.md).
