import React from 'react';
import { useCoreLayerTier } from '../../core-layer/TierContext';

interface ViewAsTierToggleProps {
  className?: string;
}

/**
 * Two-state Base ↔ Pro toggle for view-as. Phase 1: flips the mock
 * TierContext (localStorage-backed). Real admin-only wiring lands in Phase 5b.
 */
export const ViewAsTierToggle: React.FC<ViewAsTierToggleProps> = ({ className = '' }) => {
  const { tier, setTier } = useCoreLayerTier();

  return (
    <div
      role="group"
      aria-label="View as tier"
      className={`relative inline-flex items-center rounded-full border dark:border-white/10 light:border-slate-200 dark:bg-[#0d1310]/80 light:bg-white/90 backdrop-blur-sm p-0.5 ${className}`}
    >
      {/* sliding indicator */}
      <span
        aria-hidden
        className="absolute top-0.5 bottom-0.5 left-0.5 rounded-full bg-primary/15 border border-primary/40 shadow-[0_0_10px_-2px_rgba(19,236,55,0.45)] transition-transform duration-200 ease-out"
        style={{
          width: 'calc(50% - 2px)',
          transform: tier === 'pro' ? 'translateX(100%)' : 'translateX(0)',
        }}
      />
      <button
        type="button"
        onClick={() => setTier('base')}
        aria-pressed={tier === 'base'}
        title="View as Base tier"
        className={`relative inline-flex items-center gap-1 px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full transition-colors ${
          tier === 'base' ? 'text-primary' : 'dark:text-gray-400 light:text-slate-500 hover:text-primary'
        }`}
      >
        <span className="material-symbols-outlined text-[12px]">person</span>
        Base
      </button>
      <button
        type="button"
        onClick={() => setTier('pro')}
        aria-pressed={tier === 'pro'}
        title="View as Pro tier"
        className={`relative inline-flex items-center gap-1 px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full transition-colors ${
          tier === 'pro' ? 'text-primary' : 'dark:text-gray-400 light:text-slate-500 hover:text-primary'
        }`}
      >
        <span className="material-symbols-outlined text-[12px]">workspace_premium</span>
        Pro
      </button>
    </div>
  );
};
