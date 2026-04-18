import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initMicrosoftClarity } from './lib/clarity'
import { bootstrapAuth } from './services/userApi'
import { useAuthStore } from './store/authStore'

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
async function bootstrap(): Promise<void> {
  const hasPersistedUser = !!useAuthStore.getState().user;
  if (hasPersistedUser) {
    const ok = await bootstrapAuth();
    if (!ok) {
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
