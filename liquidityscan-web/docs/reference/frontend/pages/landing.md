# Pages: Landing and marketing

| File | Purpose |
|------|---------|
| [`LandingPage.tsx`](../../../../frontend/src/pages/LandingPage.tsx) | Main public homepage at `/` |
| [`NewLandingPage.tsx`](../../../../frontend/src/pages/NewLandingPage.tsx) | Alternate landing variant if routed |

**Components:** [`components/landing/*`](../components.md) — Hero, Features, Pricing, Navbar, Footer, etc.

**Note:** `App.tsx` routes `/` to `LandingPage` only for guests; authenticated users use in-app routes from MainLayout.
