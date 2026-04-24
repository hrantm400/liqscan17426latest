import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initMicrosoftClarity } from './lib/clarity'
import { initSentry } from './lib/sentry'
import { bootstrapAuth, getInMemoryAccessToken } from './services/userApi'
import { useAuthStore } from './store/authStore'

// PR 3.2 — initialize Sentry before anything else so captureException
// calls from ErrorBoundary / route loaders are captured. No-op when
// VITE_SENTRY_DSN is unset.
initSentry()

if (import.meta.env.PROD) {
  initMicrosoftClarity()
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

// PR 3.1 — if Zustand persisted a user from a previous session, silently
// refresh the access token from the httpOnly `rt` cookie before the first
// render. On failure, clear the stale user so routes redirect to /login.
function waitForStoreHydration(): Promise<void> {
  return new Promise((resolve) => {
    if (useAuthStore.persist.hasHydrated()) {
      resolve();
      return;
    }
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

async function bootstrap(): Promise<void> {
  // Zustand persist hydrates asynchronously — if we read `user` too early
  // it comes back null even when localStorage has it, silently skipping
  // the silent-refresh path and kicking the user back to /login.
  await waitForStoreHydration();
  const persistedUser = useAuthStore.getState().user;
  if (persistedUser) {
    const outcome = await bootstrapAuth();
    if (outcome.kind === 'ok') {
      // Sync refreshed access token back into the store and re-derive
      // auth flags — `partialize` only rehydrates `user`, so `token`,
      // `isAuthenticated`, and `isAdmin` are null/false after reload
      // until we restore them here.
      useAuthStore.setState({
        token: getInMemoryAccessToken(),
        isAuthenticated: true,
        isAdmin: !!persistedUser.isAdmin,
      });
    } else if (outcome.kind === 'transient') {
      // Server is rate-limiting / unreachable. Don't wipe persisted user
      // — the refresh token is almost certainly still valid; the next
      // protected API call will retry refresh once the burst window
      // passes. Restoring the persisted user lets the UI render the
      // shell instead of bouncing to /login.
      useAuthStore.setState({
        token: null,
        isAuthenticated: true,
        isAdmin: !!persistedUser.isAdmin,
      });
    } else {
      // outcome.kind === 'expired' — refresh token genuinely invalid.
      useAuthStore.setState({
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        isAdmin: false,
      });
    }
  }
  createRoot(rootElement!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap();
