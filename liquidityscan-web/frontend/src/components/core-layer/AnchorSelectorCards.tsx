import React from 'react';
import type { AnchorType } from '../../core-layer/types';
import { ANCHOR_META } from '../../core-layer/constants';

interface AnchorSelectorCardsProps {
  activeAnchor: AnchorType | 'all';
  counts: Record<AnchorType, number>;
  onSelect: (anchor: AnchorType | 'all') => void;
  className?: string;
}

const ORDER: AnchorType[] = ['WEEKLY', 'DAILY', 'FOURHOUR'];

/**
 * Three big anchor cards on the deep-dive page, mirroring the TF cards in
 * `MonitorBias.tsx`. An "All" pseudo-card sits first so users can clear their
 * filter. Horizontal scroll-snap below md per spec line 235.
 */
export const AnchorSelectorCards: React.FC<AnchorSelectorCardsProps> = ({
  activeAnchor,
  counts,
  onSelect,
  className = '',
}) => {
  const totalCount = counts.WEEKLY + counts.DAILY + counts.FOURHOUR;
  return (
    <div
      className={`flex md:grid md:grid-cols-4 gap-3 overflow-x-auto snap-x snap-mandatory md:overflow-visible ${className}`}
      role="tablist"
      aria-label="Anchor filter"
    >
      <AnchorCard
        label="All anchors"
        shortLabel="All"
        emoji="🧩"
        description="Every anchor type"
        count={totalCount}
        active={activeAnchor === 'all'}
        onClick={() => onSelect('all')}
      />
      {ORDER.map((a) => {
        const meta = ANCHOR_META[a];
        return (
          <AnchorCard
            key={a}
            label={meta.label}
            shortLabel={meta.shortLabel}
            emoji={meta.emoji}
            description={meta.description}
            count={counts[a]}
            active={activeAnchor === a}
            onClick={() => onSelect(a)}
          />
        );
      })}
    </div>
  );
};

interface AnchorCardProps {
  label: string;
  shortLabel: string;
  emoji: string;
  description: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

const AnchorCard: React.FC<AnchorCardProps> = ({
  label,
  shortLabel,
  emoji,
  description,
  count,
  active,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    role="tab"
    aria-selected={active}
    className={`shrink-0 w-64 md:w-auto snap-start text-left rounded-2xl border p-4 transition-all ${
      active
        ? 'border-primary/40 bg-gradient-to-br from-primary/15 to-transparent shadow-[0_0_18px_rgba(19,236,55,0.15)]'
        : 'dark:border-white/10 light:border-slate-200 dark:bg-white/[0.02] light:bg-white/70 hover:border-primary/30'
    }`}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xl leading-none">{emoji}</span>
        <span
          className={`text-xs font-black uppercase tracking-wider ${
            active ? 'text-primary' : 'dark:text-white light:text-slate-900'
          }`}
        >
          {shortLabel}
        </span>
      </div>
      <span
        className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded border ${
          active
            ? 'border-primary/30 bg-primary/15 text-primary'
            : 'dark:border-white/10 light:border-slate-200 dark:text-gray-400 light:text-slate-500'
        }`}
      >
        {count}
      </span>
    </div>
    <p className="mt-2 text-[10px] dark:text-gray-400 light:text-slate-500 leading-snug">
      {description}
    </p>
    <p className="mt-2 text-[11px] font-semibold dark:text-gray-300 light:text-slate-600">
      {label}
    </p>
  </button>
);
