import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';

/**
 * Binds Clarity identify + custom properties to the logged-in user; clears on logout.
 * Render once inside the app shell (e.g. App.tsx).
 */
export function ClarityIdentifyBridge() {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const clarity = window.clarity;
    if (!clarity) return;

    if (user) {
      const friendly = user.name?.trim() || `user_${user.id.slice(0, 8)}`;
      clarity('identify', user.id, undefined, undefined, friendly);
      if (user.tier) {
        clarity('set', 'tier', user.tier);
      }
      if (user.isAdmin) {
        clarity('set', 'is_admin', 'true');
      }
    } else {
      // Clear association on logout (empty custom id)
      clarity('identify', '');
    }
  }, [user]);

  return null;
}
