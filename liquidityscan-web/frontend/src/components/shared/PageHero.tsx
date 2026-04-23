import React from 'react';

export type PageHeroTone = 'primary' | 'sky' | 'amber' | 'violet' | 'fuchsia' | 'rose';

interface PageHeroProps {
  /** Small uppercase label above the title (brand chip text). */
  eyebrow: string;
  /** Material-symbols icon name for the brand chip. */
  icon: string;
  /** Big title — usually the page name. */
  title: string;
  /** One-line subtitle below the title. Optional. */
  subtitle?: string;
  /** Color tone for the brand chip + ambient glow. */
  tone?: PageHeroTone;
  /** Optional content rendered to the right of the title (e.g. action buttons). */
  rightSlot?: React.ReactNode;
  /** Optional content rendered below the subtitle (e.g. KPI strip, tabs). */
  children?: React.ReactNode;
  /** Whether to render outside the standard page padding. */
  unboxed?: boolean;
  className?: string;
}

const TONE: Record<PageHeroTone, { rgb: string; chip: string; chipText: string }> = {
  primary: { rgb: '19,236,55', chip: 'bg-primary/10 border-primary/30', chipText: 'text-primary' },
  sky: { rgb: '56,189,248', chip: 'bg-sky-400/10 border-sky-400/30', chipText: 'text-sky-400' },
  amber: { rgb: '251,191,36', chip: 'bg-amber-400/10 border-amber-400/30', chipText: 'text-amber-400' },
  violet: { rgb: '167,139,250', chip: 'bg-violet-400/10 border-violet-400/30', chipText: 'text-violet-400' },
  fuchsia: { rgb: '232,121,249', chip: 'bg-fuchsia-400/10 border-fuchsia-400/30', chipText: 'text-fuchsia-400' },
  rose: { rgb: '251,113,133', chip: 'bg-rose-400/10 border-rose-400/30', chipText: 'text-rose-400' },
};

/**
 * Compact page hero used by non-scanner pages (account, tools, listings,
 * detail views) to bring them in line with the cinematic Core-Layer language.
 * Lighter than ScannerHero — no big KPI count, optional children slot for
 * page-specific content (KPI strip, tabs, breadcrumb-extras, etc.).
 */
export const PageHero: React.FC<PageHeroProps> = ({
  eyebrow,
  icon,
  title,
  subtitle,
  tone = 'primary',
  rightSlot,
  children,
  unboxed = false,
  className = '',
}) => {
  const t = TONE[tone];
  const wrap = unboxed ? '' : 'mx-4 md:mx-6 mt-2';
  return (
    <div
      style={{ ['--page-hero-rgb' as string]: t.rgb }}
      className={`relative overflow-hidden rounded-2xl border dark:border-white/10 light:border-slate-200 dark:bg-[#0d1310]/80 light:bg-white/90 backdrop-blur-md ${wrap} ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 dark:bg-cinematic-gradient light:bg-cinematic-gradient-light opacity-90"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-40" />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full blur-3xl opacity-50"
        style={{ background: `radial-gradient(circle, rgba(var(--page-hero-rgb),0.5), transparent 70%)` }}
      />

      <div className="relative px-5 md:px-6 pt-5 pb-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border ${t.chip}`}>
              <span
                className={`material-symbols-outlined text-[16px] ${t.chipText}`}
                style={{ filter: `drop-shadow(0 0 6px rgba(var(--page-hero-rgb),0.5))` }}
              >
                {icon}
              </span>
              <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${t.chipText}`}>
                {eyebrow}
              </span>
            </span>
            <h1 className="mt-3 text-2xl md:text-3xl font-black tracking-tight dark:text-white light:text-slate-900 leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 text-sm dark:text-gray-400 light:text-slate-500 max-w-2xl">
                {subtitle}
              </p>
            )}
          </div>
          {rightSlot && <div className="shrink-0">{rightSlot}</div>}
        </div>
        {children && <div className="mt-1">{children}</div>}
      </div>
    </div>
  );
};
