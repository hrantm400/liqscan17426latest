import React from 'react';

/**
 * Shared Core-Layer status block — used by the overview, variant, and pair
 * pages for loading / empty / error / flag-off-disabled states.
 *
 * Kept intentionally small so every page renders the same skeleton and the
 * user can tell the four conditions apart at a glance:
 *   - `loading`  : data is in-flight; show a neutral spinner-ish card
 *   - `empty`    : the fetch succeeded but returned zero rows
 *   - `error`    : the fetch failed (network / 5xx); retry button
 *   - `disabled` : the backend feature flag is off — falls through to mock
 *                  upstream, so this kind is almost never user-facing. It
 *                  lives here so a future "production preview" toggle can
 *                  surface it explicitly.
 */

type Kind = 'loading' | 'empty' | 'error' | 'disabled';

interface Props {
  kind: Kind;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

const KIND_DEFAULT_MESSAGE: Record<Kind, string> = {
  loading: 'Loading Core-Layer…',
  empty: 'No Core-Layer signals active right now. The scanner runs hourly — check back next cycle.',
  error: 'Could not reach Core-Layer backend. Showing cached view.',
  disabled: 'Core-Layer is disabled in backend config.',
};

export const CoreLayerState: React.FC<Props> = ({ kind, message, onRetry, className = '' }) => {
  const copy = message ?? KIND_DEFAULT_MESSAGE[kind];
  return (
    <div
      className={`rounded-2xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.02] light:bg-white/70 px-4 py-6 flex flex-col items-center gap-3 text-center ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={
          kind === 'error'
            ? 'material-symbols-outlined text-amber-400 text-[22px]'
            : kind === 'loading'
              ? 'material-symbols-outlined text-primary text-[22px] animate-pulse'
              : 'material-symbols-outlined dark:text-gray-500 light:text-slate-400 text-[22px]'
        }
      >
        {kind === 'error' ? 'error_outline' : kind === 'loading' ? 'sync' : 'info'}
      </span>
      <p className="text-xs dark:text-gray-400 light:text-slate-500 max-w-md">{copy}</p>
      {onRetry && kind === 'error' && (
        <button
          type="button"
          onClick={onRetry}
          className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border dark:border-white/15 light:border-slate-300 dark:hover:bg-white/5 light:hover:bg-slate-50 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
};
