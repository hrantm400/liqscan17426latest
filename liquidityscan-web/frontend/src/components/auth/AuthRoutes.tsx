import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { NeonLoader } from '../shared/NeonLoader';

function waitPersistHydration(): Promise<void> {
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

/**
 * Renders children only when a JWT exists (after zustand rehydration).
 * Guests are sent to /login with return state.
 */
export function RequireAuth() {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  const [ready, setReady] = useState(useAuthStore.persist.hasHydrated());

  useEffect(() => {
    let cancelled = false;
    if (ready) return;
    waitPersistHydration().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen w-full dark:bg-background-dark light:bg-background-light">
        <NeonLoader />
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

/**
 * Login / register only for guests. Logged-in users go to dashboard.
 */
export function GuestOnlyRoute() {
  const token = useAuthStore((s) => s.token);
  const [ready, setReady] = useState(useAuthStore.persist.hasHydrated());

  useEffect(() => {
    let cancelled = false;
    if (ready) return;
    waitPersistHydration().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen w-full dark:bg-background-dark light:bg-background-light">
        <NeonLoader />
      </div>
    );
  }

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
