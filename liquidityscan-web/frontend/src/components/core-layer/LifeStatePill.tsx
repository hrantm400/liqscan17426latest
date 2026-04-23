import React from 'react';
import type { TFLifeState } from '../../core-layer/types';

interface LifeStatePillProps {
  state: TFLifeState;
  /** Hide the text label and render only the dot/icon. */
  compact?: boolean;
  className?: string;
}

const META: Record<
  TFLifeState,
  {
    label: string;
    icon: string;
    text: string;
    bg: string;
    border: string;
    dot: string;
    glow: string;
    pulse?: boolean;
  }
> = {
  fresh: {
    label: 'Fresh',
    icon: 'auto_awesome',
    text: 'text-primary',
    bg: 'bg-primary/15',
    border: 'border-primary/40',
    dot: 'bg-primary',
    glow: 'shadow-[0_0_10px_-2px_rgba(19,236,55,0.6)]',
    pulse: true,
  },
  breathing: {
    label: 'Breathing',
    icon: 'air',
    text: 'text-amber-400',
    bg: 'bg-amber-400/15',
    border: 'border-amber-400/40',
    dot: 'bg-amber-400',
    glow: 'shadow-[0_0_10px_-2px_rgba(251,191,36,0.6)]',
    pulse: true,
  },
  steady: {
    label: 'Steady',
    icon: 'radio_button_unchecked',
    text: 'dark:text-gray-300 light:text-slate-600',
    bg: 'dark:bg-white/[0.04] light:bg-slate-100',
    border: 'dark:border-white/10 light:border-slate-200',
    dot: 'dark:bg-gray-500 light:bg-slate-400',
    glow: '',
  },
};

/**
 * Compact pill for TF life state. v1: `fresh` applies only to 1H per spec
 * line 138; W and 1D never render fresh/breathing — callers suppress this
 * component on those timeframes.
 */
export const LifeStatePill: React.FC<LifeStatePillProps> = ({
  state,
  compact,
  className = '',
}) => {
  const meta = META[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider leading-none ${meta.bg} ${meta.border} ${meta.text} ${meta.glow} ${className}`}
      aria-label={`TF state: ${meta.label}`}
    >
      <span className="relative flex items-center">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`}
          aria-hidden
        />
        {meta.pulse && (
          <span
            className={`absolute inset-0 inline-block h-1.5 w-1.5 rounded-full ${meta.dot} opacity-70 animate-ping`}
            aria-hidden
          />
        )}
      </span>
      {!compact && <span>{meta.label}</span>}
    </span>
  );
};
