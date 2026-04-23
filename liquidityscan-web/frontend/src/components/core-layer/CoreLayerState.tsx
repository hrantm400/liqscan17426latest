import React from 'react';

/**
 * Shared Core-Layer status block — used by the overview, variant, and pair
 * pages for loading / empty / error / flag-off-disabled states.
 *
 * Kept intentionally small so every page renders the same skeleton and the
 * user can tell the four conditions apart at a glance:
 *   - `loading`  : data is in-flight; show an animated scanner/spinner card
 *   - `empty`    : the fetch succeeded but returned zero rows
 *   - `error`    : the fetch failed (network / 5xx); retry button
 *   - `disabled` : the backend feature flag is off
 */

type Kind = 'loading' | 'empty' | 'error' | 'disabled';

interface Props {
  kind: Kind;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

const KIND_DEFAULT_MESSAGE: Record<Kind, string> = {
  loading: 'Scanning timeframes for alignments…',
  empty: 'No Core-Layer signals active right now. The scanner runs hourly — check back next cycle.',
  error: 'Could not reach Core-Layer backend. Showing cached view.',
  disabled: 'Core-Layer is disabled in backend config.',
};

const KIND_TONE: Record<
  Kind,
  { icon: string; iconClass: string; ring: string; bg: string }
> = {
  loading: {
    icon: 'radar',
    iconClass: 'text-primary',
    ring: 'border-primary/30',
    bg: 'bg-primary/10',
  },
  empty: {
    icon: 'hourglass_empty',
    iconClass: 'text-sky-400',
    ring: 'border-sky-400/30',
    bg: 'bg-sky-400/10',
  },
  error: {
    icon: 'error_outline',
    iconClass: 'text-amber-400',
    ring: 'border-amber-400/30',
    bg: 'bg-amber-400/10',
  },
  disabled: {
    icon: 'block',
    iconClass: 'dark:text-gray-400 light:text-slate-500',
    ring: 'dark:border-white/10 light:border-slate-200',
    bg: 'dark:bg-white/[0.04] light:bg-slate-100',
  },
};

const KIND_TITLE: Record<Kind, string> = {
  loading: 'Loading',
  empty: 'No active alignments',
  error: 'Connection issue',
  disabled: 'Disabled',
};

export const CoreLayerState: React.FC<Props> = ({ kind, message, onRetry, className = '' }) => {
  const tone = KIND_TONE[kind];
  const copy = message ?? KIND_DEFAULT_MESSAGE[kind];
  const title = KIND_TITLE[kind];
  const isLoading = kind === 'loading';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border dark:border-white/10 light:border-slate-200 dark:bg-[#0d1310]/60 light:bg-white/80 backdrop-blur-md px-6 py-8 flex flex-col items-center gap-3 text-center ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* ambient glow that matches the kind */}
      <span
        aria-hidden
        className={`pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-40 w-40 rounded-full blur-3xl opacity-40 ${
          isLoading ? 'animate-pulse' : ''
        } ${tone.bg}`}
      />
      <div
        className={`relative grid h-14 w-14 place-items-center rounded-2xl border ${tone.ring} ${tone.bg} ${tone.iconClass}`}
      >
        <span
          className={`material-symbols-outlined text-[28px] ${isLoading ? 'animate-spin' : ''}`}
        >
          {tone.icon}
        </span>
      </div>
      <div className="relative flex flex-col gap-1 max-w-md">
        <h3 className="text-sm font-black tracking-wide uppercase dark:text-white light:text-slate-900">
          {title}
        </h3>
        <p className="text-xs dark:text-gray-400 light:text-slate-500 leading-relaxed">{copy}</p>
      </div>
      {onRetry && kind === 'error' && (
        <button
          type="button"
          onClick={onRetry}
          className="relative inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest px-3.5 py-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">refresh</span>
          Retry
        </button>
      )}
    </div>
  );
};
