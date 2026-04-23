import React from 'react';
import { Link } from 'react-router-dom';
import { AnimatedNumber } from '../animations/AnimatedNumber';

export type ScannerHeroTone = 'primary' | 'sky' | 'amber' | 'violet' | 'fuchsia';

interface ScannerHeroProps {
  /** Used by analytics / data-attr — kept lightweight so multiple scanners can share. */
  slug: string;
  eyebrow: string;
  icon: string;
  title: string;
  subtitle: string;
  tone?: ScannerHeroTone;
  /** Big "total active" number on the right side of the hero. */
  kpiTotal: number;
  /** Up to 4 stat tiles rendered as a strip below the title. */
  kpis?: Array<{ label: string; value: number | string; hint?: string }>;
  /** Optional extra content slot rendered at the right end of the eyebrow row. */
  rightSlot?: React.ReactNode;
  /** When provided, the hero acts as a link to a related page (e.g. Core-Layer variant). */
  linkTo?: string;
  linkLabel?: string;
  className?: string;
}

const TONE: Record<
  ScannerHeroTone,
  { rgb: string; hex: string; chip: string; chipText: string; ring: string }
> = {
  primary: {
    rgb: '19,236,55',
    hex: '#13ec37',
    chip: 'bg-primary/10 border-primary/30',
    chipText: 'text-primary',
    ring: 'ring-primary/40',
  },
  sky: {
    rgb: '56,189,248',
    hex: '#38bdf8',
    chip: 'bg-sky-400/10 border-sky-400/30',
    chipText: 'text-sky-400',
    ring: 'ring-sky-400/40',
  },
  amber: {
    rgb: '251,191,36',
    hex: '#fbbf24',
    chip: 'bg-amber-400/10 border-amber-400/30',
    chipText: 'text-amber-400',
    ring: 'ring-amber-400/40',
  },
  violet: {
    rgb: '167,139,250',
    hex: '#a78bfa',
    chip: 'bg-violet-400/10 border-violet-400/30',
    chipText: 'text-violet-400',
    ring: 'ring-violet-400/40',
  },
  fuchsia: {
    rgb: '232,121,249',
    hex: '#e879f9',
    chip: 'bg-fuchsia-400/10 border-fuchsia-400/30',
    chipText: 'text-fuchsia-400',
    ring: 'ring-fuchsia-400/40',
  },
};

/**
 * Shared hero strip for scanner monitor pages. Renders a glass-panel card with
 * a cinematic gradient background, brand chip, title, subtitle, KPI strip and
 * an optional Core-Layer link. Designed to slot in between PageHeader and the
 * existing TF cards / signal list — no layout coupling beyond the parent flex.
 */
export const ScannerHero: React.FC<ScannerHeroProps> = ({
  slug,
  eyebrow,
  icon,
  title,
  subtitle,
  tone = 'primary',
  kpiTotal,
  kpis = [],
  rightSlot,
  linkTo,
  linkLabel,
  className = '',
}) => {
  const t = TONE[tone];
  return (
    <div
      data-scanner-slug={slug}
      style={{ ['--scanner-rgb' as string]: t.rgb, ['--scanner-hex' as string]: t.hex }}
      className={`relative overflow-hidden rounded-2xl border dark:border-white/10 light:border-slate-200 dark:bg-[#0d1310]/80 light:bg-white/90 backdrop-blur-md mx-4 md:mx-6 mt-2 ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 dark:bg-cinematic-gradient light:bg-cinematic-gradient-light opacity-90"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-50" />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full blur-3xl opacity-50"
        style={{ background: `radial-gradient(circle, rgba(var(--scanner-rgb),0.5), transparent 70%)` }}
      />

      <div className="relative px-5 md:px-6 pt-5 pb-4 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border ${t.chip}`}>
            <span
              className={`material-symbols-outlined text-[16px] ${t.chipText}`}
              style={{ filter: `drop-shadow(0 0 6px rgba(var(--scanner-rgb),0.5))` }}
            >
              {icon}
            </span>
            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${t.chipText}`}>
              {eyebrow}
            </span>
          </div>
          {rightSlot}
        </div>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight dark:text-white light:text-slate-900 leading-tight truncate">
              {title}
            </h1>
            <p className="mt-1.5 text-sm dark:text-gray-400 light:text-slate-500 max-w-2xl">
              {subtitle}
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="text-right">
              <div className="text-[10px] font-mono font-bold uppercase tracking-widest dark:text-gray-500 light:text-slate-400 leading-none">
                Active
              </div>
              <div
                className="mt-1 text-4xl font-black tabular-nums leading-none"
                style={{
                  color: t.hex,
                  filter: `drop-shadow(0 0 12px rgba(var(--scanner-rgb),0.45))`,
                }}
              >
                <AnimatedNumber value={kpiTotal} />
              </div>
            </div>
            {linkTo && (
              <Link
                to={linkTo}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border ${t.chip} ${t.chipText} text-[10px] font-black uppercase tracking-widest hover:bg-[rgba(var(--scanner-rgb),0.15)] transition-colors`}
              >
                {linkLabel ?? 'Open'}
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            )}
          </div>
        </div>

        {kpis.length > 0 && (
          <div
            className="grid gap-2 md:gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.min(kpis.length, 4)}, minmax(0, 1fr))` }}
          >
            {kpis.map((k) => {
              const value =
                typeof k.value === 'number' ? <AnimatedNumber value={k.value} /> : k.value;
              const isZero = typeof k.value === 'number' && k.value === 0;
              return (
                <div
                  key={k.label}
                  className="flex items-center gap-2.5 rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.03] light:bg-white/70 px-3 py-2"
                >
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-lg border shrink-0 ${t.chip} ${t.chipText}`}
                  >
                    <span className="text-[11px] font-mono font-black tracking-wider">
                      {k.label}
                    </span>
                  </span>
                  <div className="min-w-0">
                    <div
                      className={`text-base font-black tabular-nums leading-none ${
                        isZero ? 'dark:text-gray-500 light:text-slate-400' : 'dark:text-white light:text-slate-900'
                      }`}
                    >
                      {value}
                    </div>
                    {k.hint && (
                      <div className="mt-0.5 text-[10px] dark:text-gray-500 light:text-slate-400 leading-none">
                        {k.hint}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
