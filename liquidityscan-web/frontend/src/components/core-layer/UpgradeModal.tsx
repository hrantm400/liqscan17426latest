import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Direction, TF } from '../../core-layer/types';

export interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  pair?: string;
  direction?: Direction;
  depth?: number;
  visibleChain?: string;
  hiddenTfsCount?: number;
  visibleCorrelations?: string[];
  hiddenCorrelationsCount?: number;
  /**
   * Blocking mode intercepts a Pro-gated pair the Base user tried to open.
   * Non-blocking mode is the legend-row upsell — dismissible via Esc or
   * backdrop click. Per spec line 144.
   */
  blocking?: boolean;
}

const FEATURE_BULLETS = [
  'Full TF chains including 15m and 5m sub-hour alignments',
  'High-correlation 4H+15m and 1H+5m badges',
  'Instant alerts when a chain promotes from 3-deep to 4+',
  'Private Core-Layer dashboard updates every 5 minutes',
];

/**
 * Upgrade-to-Pro modal. Focus-trapped, `aria-modal="true"`, Esc closes in
 * non-blocking mode. Primary CTA logs `upgrade clicked` + closes (real
 * payment flow wires up in Phase 5 / billing).
 */
export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  open,
  onClose,
  pair,
  direction,
  depth,
  visibleChain,
  hiddenTfsCount,
  visibleCorrelations,
  hiddenCorrelationsCount,
  blocking = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    const root = containerRef.current;
    const firstFocusable = root?.querySelector<HTMLElement>(
      'button, [href], [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !blocking) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && root) {
        const focusable = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, blocking, onClose]);

  const handleUpgrade = () => {
    // Phase 5 wires this to the real billing flow.
    console.log('upgrade clicked', { pair, direction, depth });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={pair ? `Upgrade for ${pair}` : 'Upgrade to Pro'}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 dark:bg-black/70 light:bg-black/40 backdrop-blur-md"
            onClick={blocking ? undefined : onClose}
          />
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full max-w-lg dark:bg-[#0a140d]/95 light:bg-white/95 rounded-2xl border dark:border-primary/30 light:border-primary/40 shadow-[0_0_60px_rgba(19,236,55,0.22)] overflow-hidden"
          >
            {/* cinematic gradient header */}
            <div className="relative overflow-hidden">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 dark:bg-cinematic-gradient light:bg-cinematic-gradient-light opacity-90"
              />
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-40" />
              <span
                aria-hidden
                className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/25 blur-3xl"
              />
              <div className="relative px-6 pt-6 pb-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10">
                    <span className="material-symbols-outlined text-primary text-[16px] drop-shadow-[0_0_6px_rgba(19,236,55,0.5)]">
                      workspace_premium
                    </span>
                    <span className="text-[10px] font-black tracking-[0.2em] uppercase text-primary">
                      Pro-only signal
                    </span>
                  </div>
                  {!blocking && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-1 rounded-md dark:text-gray-400 light:text-slate-500 dark:hover:bg-white/10 light:hover:bg-slate-100 transition-colors"
                      aria-label="Close"
                    >
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  )}
                </div>
                <h2 className="mt-4 text-2xl md:text-3xl font-black dark:text-white light:text-slate-900 tracking-tight leading-tight">
                  {pair ? (
                    <>
                      <span className="text-primary drop-shadow-[0_0_8px_rgba(19,236,55,0.35)]">
                        {pair}
                      </span>{' '}
                      has a Pro-tier alignment
                    </>
                  ) : (
                    'Unlock Core-Layer Pro'
                  )}
                </h2>
                <p className="mt-2 text-sm dark:text-gray-400 light:text-slate-500 max-w-md">
                  Upgrade to reveal sub-hour alignments, deeper chains, and instant
                  promotion alerts.
                </p>
              </div>
            </div>

            <div className="p-6 pt-0 space-y-5">
              {pair && (
                <div className="rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.03] light:bg-slate-50 p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em] px-2 py-0.5 rounded-md border leading-none ${
                        direction === 'BUY'
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : direction === 'SELL'
                            ? 'bg-red-500/10 text-red-400 border-red-500/30'
                            : 'dark:bg-white/5 light:bg-slate-100 dark:text-gray-400 light:text-slate-500 dark:border-white/10 light:border-slate-200'
                      }`}
                    >
                      {direction ?? '—'}
                    </span>
                    {depth && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em] px-2 py-0.5 rounded-md border bg-amber-400/10 text-amber-400 border-amber-400/30 leading-none">
                        <span className="material-symbols-outlined text-[12px]">layers</span>
                        {depth}-deep
                      </span>
                    )}
                  </div>
                  {visibleChain && (
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest dark:text-gray-500 light:text-slate-400">
                        Chain
                      </span>
                      <span className="text-xs font-mono font-black dark:text-white light:text-slate-700 tracking-wider">
                        {visibleChain}
                      </span>
                      {hiddenTfsCount ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-md px-1.5 py-0.5 leading-none">
                          <span className="material-symbols-outlined text-[12px]">lock</span>
                          +{hiddenTfsCount} Pro
                        </span>
                      ) : null}
                    </div>
                  )}
                  {(visibleCorrelations?.length || hiddenCorrelationsCount) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {visibleCorrelations?.map((c) => (
                        <span
                          key={c}
                          className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-primary/30 text-primary bg-primary/10"
                        >
                          {c}
                        </span>
                      ))}
                      {hiddenCorrelationsCount ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-md px-1.5 py-0.5">
                          <span className="material-symbols-outlined text-[12px]">lock</span>
                          +{hiddenCorrelationsCount} hidden
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              <ul className="space-y-2">
                {FEATURE_BULLETS.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex items-start gap-2.5 text-sm dark:text-gray-200 light:text-slate-700"
                  >
                    <span className="grid h-5 w-5 mt-0.5 place-items-center rounded-full bg-primary/15 border border-primary/30 text-primary shrink-0">
                      <span className="material-symbols-outlined text-[14px]">check</span>
                    </span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleUpgrade}
                  className="group relative flex-1 px-4 py-3 rounded-xl bg-primary text-black text-sm font-black tracking-wide transition-all hover:shadow-[0_0_24px_rgba(19,236,55,0.5)] hover:bg-primary-hover overflow-hidden"
                >
                  <span className="relative inline-flex items-center justify-center gap-2 w-full">
                    <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                    Upgrade to Pro · $299/mo
                  </span>
                </button>
                {!blocking && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-3 rounded-xl border dark:border-white/10 light:border-slate-200 dark:text-gray-300 light:text-slate-600 text-sm font-semibold transition-colors dark:hover:bg-white/5 light:hover:bg-slate-50"
                  >
                    Not now
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

/** Utility to build the visible-chain string that the pair-detail header passes to the modal. */
export function buildVisibleChainString(chain: TF[]): string {
  return chain.join(' · ');
}
