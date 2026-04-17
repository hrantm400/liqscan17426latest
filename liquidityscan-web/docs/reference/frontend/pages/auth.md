# Pages: Login and register

| File | Route | Purpose |
|------|-------|---------|
| [`Login.tsx`](../../../../frontend/src/pages/Login.tsx) | `/login` | Email/password + optional Google; `GuestOnlyRoute` |
| [`Register.tsx`](../../../../frontend/src/pages/Register.tsx) | `/register` | Sign up; optional `referralCode` query/body |

**API:** `ApiClient.login` / `register` in [`userApi`](../services.md); tokens persisted to [`useAuthStore`](../stores.md).

**Related:** [`OAuthHandler`](../routing-and-layout.md) for Google redirect flow.
