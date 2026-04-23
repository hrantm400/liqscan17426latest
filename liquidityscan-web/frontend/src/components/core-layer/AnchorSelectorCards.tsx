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

// Per-anchor accent — matches the distribution bar colors in VariantSummaryCard
// so the two views read as a coherent system.
const ANCHOR_TONE: Record<AnchorType | 'all', {
  hex: string;
  ring: string;
  glow: string;
  dot: string;
  icon: string;
}> = {
  all: {
    hex: '#13ec37',
    ring: 'border-primary/40',
    glow: 'shadow-[0_0_20px_-4px_rgba(19,236,55,0.45)]',
    dot: 'bg-primary',
    icon: 'select_all',
  },
  WEEKLY: {
    hex: '#fbbf24',
    ring: 'border-amber-400/40',
    glow: 'shadow-[0_0_20px_-4px_rgba(251,191,36,0.45)]',
    dot: 'bg-amber-400',
    icon: 'calendar_view_week',
  },
  DAILY: {
    hex: '#38bdf8',
    ring: 'border-sky-400/40',
    glow: 'shadow-[0_0_20px_-4px_rgba(56,189,248,0.45)]',
    dot: 'bg-sky-400',
    icon: 'today',
  },
  FOURHOUR: {
    hex: '#e879f9',
    ring: 'border-fuchsia-400/40',
    glow: 'shadow-[0_0_20px_-4px_rgba(232,121,249,0.45)]',
    dot: 'bg-fuchsia-400',
    icon: 'schedule',
  },
};

/**
 * Anchor selector. "All" pseudo-card sits first so users can clear the filter.
 * Horizontal scroll-snap below md, 4-column grid above.
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
      className={`flex md:grid md:grid-cols-4 gap-2 md:gap-3 overflow-x-auto snap-x snap-mandatory md:overflow-visible no-scrollbar ${className}`}
      role="tablist"
      aria-label="Anchor filter"
    >
      <AnchorCard
        anchor="all"
        label="All anchors"
        shortLabel="All"
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
            anchor={a}
            label={meta.label}
            shortLabel={meta.shortLabel}
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
  anchor: AnchorType | 'all';
  label: string;
  shortLabel: string;
  description: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

const AnchorCard: React.FC<AnchorCardProps> = ({
  anchor,
  label,
  shortLabel,
  description,
  count,
  active,
  onClick,
}) => {
  const tone = ANCHOR_TONE[anchor];
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`shrink-0 w-56 md:w-auto snap-start text-left rounded-2xl border p-3.5 transition-all duration-200 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/40 ${
        active
          ? `${tone.ring} bg-gradient-to-br dark:from-white/[0.06] dark:to-transparent light:from-white light:to-slate-50 ${tone.glow}`
          : 'dark:border-white/10 light:border-slate-200 dark:bg-white/[0.02] light:bg-white/70 hover:dark:bg-white/[0.04] hover:light:bg-white hover:dark:border-white/20'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`grid h-8 w-8 place-items-center rounded-lg shrink-0 transition-all ${
              active ? '' : 'dark:bg-white/[0.04] light:bg-slate-100'
            }`}
            style={
              active
                ? {
                    color: tone.hex,
                    backgroundColor: `${tone.hex}1f`,
                    boxShadow: `0 0 12px -2px ${tone.hex}66`,
                  }
                : undefined
            }
          >
            <span className="material-symbols-outlined text-[18px]">{tone.icon}</span>
          </span>
          <span
            className={`text-xs font-black uppercase tracking-wider truncate ${
              active ? '' : 'dark:text-white light:text-slate-900'
            }`}
            style={active ? { color: tone.hex } : undefined}
          >
            {shortLabel}
          </span>
        </div>
        <span
          className={`text-[11px] font-mono font-black tabular-nums px-2 py-0.5 rounded border leading-none ${
            active ? '' : 'dark:border-white/10 light:border-slate-200 dark:text-gray-300 light:text-slate-600'
          }`}
          style={
            active
              ? {
                  color: tone.hex,
                  borderColor: `${tone.hex}55`,
                  backgroundColor: `${tone.hex}1a`,
                }
              : undefined
          }
        >
          {count}
        </span>
      </div>
      <p className="mt-2 text-[11px] dark:text-gray-400 light:text-slate-500 leading-snug truncate">
        {label}
      </p>
      <p className="mt-1 text-[10px] dark:text-gray-500 light:text-slate-400 leading-snug line-clamp-2">
        {description}
      </p>
    </button>
  );
};
