import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { setGaUser, trackPageview } from '../lib/ga';

/**
 * Sends GA4 page_view on SPA navigations and syncs user_id with auth state.
 * Render once inside BrowserRouter (e.g. App.tsx).
 */
export function GaTrackingBridge() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    trackPageview(path, document.title);
  }, [location.pathname, location.search]);

  useEffect(() => {
    setGaUser(user?.id ?? null);
  }, [user?.id]);

  return null;
}
