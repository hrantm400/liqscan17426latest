import React from 'react';
import type { TFLifeState } from '../../core-layer/types';

interface LifeStatePillProps {
  state: TFLifeState;
  /** Hide the text label and render only the glyph (useful in tight card corners). */
  compact?: boolean;
  className?: string;
}

const META: Record<TFLifeState, { glyph: string; label: string; classes: string }> = {
  fresh: {
    glyph: '✨',
    label: 'fresh',
    classes: 'bg-primary/15 text-primary border-primary/30',
  },
  breathing: {
    glyph: '⏱',
    label: 'breathing',
    classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  steady: {
    glyph: '•',
    label: 'steady',
    classes: 'bg-white/5 text-gray-400 border-white/10',
  },
};

/**
 * Compact pill for TF life state (see ADR D13). Per spec line 138, W and 1D
 * never render fresh/breathing — callers are responsible for suppressing this
 * component on those timeframes. In v1 `fresh` applies only to 1H.
 */
export const LifeStatePill: React.FC<LifeStatePillProps> = ({ state, compact, className = '' }) => {
  const meta = META[state];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold leading-none ${meta.classes} ${className}`}
      aria-label={`TF state: ${meta.label}`}
    >
      <span>{meta.glyph}</span>
      {!compact && <span>{meta.label}</span>}
    </span>
  );
};
