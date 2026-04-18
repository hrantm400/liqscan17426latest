import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';
import { wsService } from '../services/websocket';
import { setInMemoryAccessToken } from '../services/userApi';

/**
 * PR 3.1 (JWT httpOnly cookie migration):
 * - Refresh token now lives in an httpOnly `rt` cookie (server-set, path=/api/auth).
 *   It is NEVER read/written by this store.
 * - Access token is kept in memory only — no localStorage mirror.
 * - Only `user` is persisted so we can render the shell while `bootstrapAuth()`
 *   silently refreshes on app boot.
 * - `setRefreshToken` is kept as a no-op for one week so mid-flight OAuth
 *   handlers calling it don't crash. Will be removed in PR 3.1b.
 */
interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setRefreshToken: (refreshToken: string | null) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isAdmin: false,
      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          isAdmin: !!user?.isAdmin,
        }),
      setToken: (token) => {
        setInMemoryAccessToken(token);
        set({ token });
      },
      setRefreshToken: () => {
        // no-op since PR 3.1 (cookie-based). Kept for one week, see PR 3.1b.
      },
      logout: async () => {
        wsService.disconnect();
        setInMemoryAccessToken(null);
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          isAdmin: false,
        });
        sessionStorage.removeItem('oauth_token');
        sessionStorage.removeItem('oauth_refreshToken');

        // Fire-and-forget: tell backend to revoke the refresh token + clear cookie.
        try {
          const { apiBaseUrl } = await import('../services/userApi');
          await fetch(`${apiBaseUrl()}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
          });
        } catch {
          /* ignore — client-side state already cleared */
        }
      },
    }),
    {
      name: 'auth-storage',
      // Persist only non-sensitive profile data. The access token lives in
      // memory (see setInMemoryAccessToken), and the refresh token lives in
      // the httpOnly `rt` cookie set by the backend.
      partialize: (state) => ({ user: state.user }) as AuthState,
    },
  ),
);
