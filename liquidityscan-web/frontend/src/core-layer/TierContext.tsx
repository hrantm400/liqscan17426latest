import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { LS_KEYS } from './constants';
import { useTierGating } from '../hooks/useTierGating';

/**
 * Core-Layer tier context — Phase 7.3.
 *
 * Originally a Phase 1 mock that ran entirely off a localStorage toggle.
 * Now it is the single source of truth for "what can this user see on
 * Core-Layer pages?" and composes two independent inputs:
 *
 *   1. `effectiveTier` — the REAL tier the backend will filter against,
 *      derived from `useTierGating().hasFullProductAccess`. Anonymous /
 *      SCOUT → 'base'. FULL_ACCESS (paid OR launch-promo FREE) → 'pro'.
 *      The backend's CoreLayerTierResolverService makes the same call
 *      against the same user, so `effectiveTier` matches what data the
 *      server actually returns.
 *
 *   2. `viewAsTier` — an optional admin/debug override that lets a
 *      FULL_ACCESS user preview the SCOUT experience (padlocks, lock
 *      copy, upgrade CTA) without downgrading their account. Persisted
 *      in localStorage so the override survives reloads. It never
 *      grants MORE access than `effectiveTier` — setting view-as to
 *      'pro' while the real tier is 'base' is a no-op for the merged
 *      `tier` value (the backend would still strip Pro data so the UI
 *      would just render empty rows).
 *
 *   3. `tier` — the merged value UI code should read. Merging rule:
 *        - If viewAsTier is set AND it is a downgrade of effectiveTier,
 *          use viewAsTier.
 *        - Otherwise use effectiveTier.
 *      This gives admins a reliable way to preview the locked UX and
 *      keeps SCOUT users from fooling themselves into seeing Pro state
 *      that doesn't exist.
 *
 * During loading (before /api/user/tier resolves) we optimistically
 * return 'base' so the UI renders the lock state first and unlocks
 * after the real tier lands. That's intentional — flashing Pro data
 * and then locking it is worse UX than the reverse.
 */

export type CoreLayerTier = 'base' | 'pro';

interface TierContextValue {
  /** Merged tier — what the UI should render against. */
  tier: CoreLayerTier;
  /** The real backend-authoritative tier. Same mapping the server uses. */
  effectiveTier: CoreLayerTier;
  /** True while /api/user/tier is still resolving. */
  loading: boolean;
  /** The current view-as override (null = follow effectiveTier). */
  viewAsTier: CoreLayerTier | null;
  /** Set a view-as override. Downgrades only — upgrades no-op on merged tier. */
  setViewAsTier: (tier: CoreLayerTier | null) => void;
  /** Convenience: `setViewAsTier(t)` kept for existing ViewAsTierToggle API. */
  setTier: (tier: CoreLayerTier) => void;
  /** Convenience toggle across view-as states. */
  toggle: () => void;
}

const TierContext = createContext<TierContextValue | null>(null);

function readInitialViewAs(): CoreLayerTier | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(LS_KEYS.tier);
    return saved === 'pro' || saved === 'base' ? saved : null;
  } catch {
    return null;
  }
}

export const TierProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { hasFullProductAccess, loading } = useTierGating();
  const [viewAsTier, setViewAsTierState] = useState<CoreLayerTier | null>(
    readInitialViewAs,
  );

  useEffect(() => {
    try {
      if (viewAsTier === null) {
        window.localStorage.removeItem(LS_KEYS.tier);
      } else {
        window.localStorage.setItem(LS_KEYS.tier, viewAsTier);
      }
    } catch {
      // Storage can throw in privacy mode / quota-exceeded; override stays
      // in memory for the session.
    }
  }, [viewAsTier]);

  const effectiveTier: CoreLayerTier = hasFullProductAccess ? 'pro' : 'base';

  const tier: CoreLayerTier = useMemo(() => {
    // Only honor the override when it is a downgrade. Upgrading beyond
    // the real tier would leak nothing (server is authoritative) but
    // would look broken — padlocks disappear while the data stays empty.
    if (viewAsTier === 'base' && effectiveTier === 'pro') return 'base';
    return effectiveTier;
  }, [viewAsTier, effectiveTier]);

  const setViewAsTier = (next: CoreLayerTier | null) => setViewAsTierState(next);
  const setTier = (next: CoreLayerTier) => setViewAsTierState(next);
  const toggle = () =>
    setViewAsTierState((t) => (t === 'pro' ? 'base' : t === 'base' ? 'pro' : 'base'));

  return (
    <TierContext.Provider
      value={{
        tier,
        effectiveTier,
        loading,
        viewAsTier,
        setViewAsTier,
        setTier,
        toggle,
      }}
    >
      {children}
    </TierContext.Provider>
  );
};

export const useCoreLayerTier = (): TierContextValue => {
  const ctx = useContext(TierContext);
  if (!ctx) {
    throw new Error('useCoreLayerTier must be used within <TierProvider>');
  }
  return ctx;
};
