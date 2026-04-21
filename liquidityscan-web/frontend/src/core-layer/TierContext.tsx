import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { LS_KEYS } from './constants';

// Phase 1 mock-only tier state. Real tier binding lands in Phase 5 (see ADR D12).
// Do NOT replace this with useTierGating() until Phase 5 integration.

export type CoreLayerTier = 'base' | 'pro';

interface TierContextValue {
  tier: CoreLayerTier;
  setTier: (tier: CoreLayerTier) => void;
  toggle: () => void;
}

const DEFAULT_TIER: CoreLayerTier = 'base';

const TierContext = createContext<TierContextValue | null>(null);

function readInitialTier(): CoreLayerTier {
  if (typeof window === 'undefined') return DEFAULT_TIER;
  try {
    const saved = window.localStorage.getItem(LS_KEYS.tier);
    return saved === 'pro' || saved === 'base' ? saved : DEFAULT_TIER;
  } catch {
    return DEFAULT_TIER;
  }
}

export const TierProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tier, setTierState] = useState<CoreLayerTier>(readInitialTier);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_KEYS.tier, tier);
    } catch {
      // Storage can throw in privacy mode / quota-exceeded; tier stays in
      // memory for the session, which is acceptable for a mock-only context.
    }
  }, [tier]);

  const toggle = () => setTierState((t) => (t === 'pro' ? 'base' : 'pro'));

  return (
    <TierContext.Provider value={{ tier, setTier: setTierState, toggle }}>
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
