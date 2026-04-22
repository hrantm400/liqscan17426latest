import React from 'react';
import { useCoreLayerTier } from '../../core-layer/TierContext';

interface ViewAsTierToggleProps {
  className?: string;
}

/**
 * Two-state Base ↔ Pro toggle for view-as. In Phase 1 this flips the mock
 * TierContext (localStorage-backed); real admin-only wiring lands in Phase 5b.
 *
 * Per spec line 135, the visual diff between Base and Pro is zero in v1 (no
 * sub-1h TFs yet). The toggle still flips the context so developers can
 * verify the plumbing end-to-end; the difference becomes meaningful in Phase 7
 * when 15m/5m unlock.
 */
export const ViewAsTierToggle: React.FC<ViewAsTierToggleProps> = ({ className = '' }) => {
  const { tier, setTier } = useCoreLayerTier();

  return (
    <div
      role="group"
      aria-label="View as tier"
      className={`inline-flex items-center rounded-full border dark:border-white/10 light:border-slate-200 dark:bg-white/5 light:bg-slate-100 p-0.5 ${className}`}
    >
      <button
        type="button"
        onClick={() => setTier('base')}
        aria-pressed={tier === 'base'}
        className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full transition-colors ${
          tier === 'base'
            ? 'bg-primary/20 text-primary shadow-[0_0_8px_rgba(19,236,55,0.2)]'
            : 'dark:text-gray-400 light:text-slate-500 hover:text-primary'
        }`}
      >
        Base
      </button>
      <button
        type="button"
        onClick={() => setTier('pro')}
        aria-pressed={tier === 'pro'}
        className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full transition-colors ${
          tier === 'pro'
            ? 'bg-primary/20 text-primary shadow-[0_0_8px_rgba(19,236,55,0.2)]'
            : 'dark:text-gray-400 light:text-slate-500 hover:text-primary'
        }`}
      >
        Pro
      </button>
    </div>
  );
};
