import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';
import { wsService } from '../services/websocket';

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setRefreshToken: (refreshToken: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      // Sync token from Zustand store to localStorage on initialization
      const syncTokenToLocalStorage = () => {
        const state = get();
        if (state.token) {
          localStorage.setItem('token', state.token);
        }
      };

      // Sync on first load
      setTimeout(syncTokenToLocalStorage, 0);

      return {
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        isAdmin: false,
        setUser: (user) => set({ 
          user, 
          isAuthenticated: !!user,
          isAdmin: !!(user?.isAdmin),
        }),
        setToken: (token) => {
          set({ token });
          // Also save to localStorage for backward compatibility with API client
          if (token) {
            localStorage.setItem('token', token);
          } else {
            localStorage.removeItem('token');
          }
        },
        setRefreshToken: (refreshToken) => set({ refreshToken }),
        logout: () => {
          wsService.disconnect();
          set({ user: null, token: null, refreshToken: null, isAuthenticated: false, isAdmin: false });
          // Also clear localStorage to ensure complete logout
          localStorage.removeItem('auth-storage');
          localStorage.removeItem('token'); // Also remove token for backward compatibility
          sessionStorage.removeItem('oauth_token');
          sessionStorage.removeItem('oauth_refreshToken');
        },
      };
    },
    {
      name: 'auth-storage',
      onRehydrateStorage: () => (state) => {
        // Sync token to localStorage after rehydration
        if (state?.token) {
          localStorage.setItem('token', state.token);
        }
      },
    }
  )
);
