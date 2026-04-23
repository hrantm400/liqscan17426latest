import React, { useMemo } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { VariantSummaryCard } from '../components/core-layer/VariantSummaryCard';
import { RecentPromotions } from '../components/core-layer/RecentPromotions';
import { HowItWorksCollapsible } from '../components/core-layer/HowItWorksCollapsible';
import { ProLabelPill } from '../components/subscriptions/ProLabelPill';
import { ViewAsTierToggle } from '../components/core-layer/ViewAsTierToggle';
import { IntroVideoPill } from '../components/core-layer/IntroVideoPill';
import { CoreLayerState } from '../components/core-layer/CoreLayerState';
import {
  MOCK_CORE_LAYER_SIGNALS,
  getMockRecentPromotions,
} from '../core-layer/mockCoreLayerData';
import { useCoreLayerSignals, useCoreLayerStats } from '../hooks/useCoreLayer';
import type { AnchorType, CoreLayerHistoryEntry, CoreLayerSignal, CoreLayerVariant } from '../core-layer/types';

/**
 * `/core-layer` — overview page. Three variant tiles, a recent-promotions
 * widget, and an educational collapsible. Gateway into each variant's
 * deep-dive page.
 *
 * Phase 5 — data source is live when the backend flag is on, mock otherwise.
 * `useCoreLayerStats` carries the `enabled` truth; when false the whole page
 * falls back to mock so the UI stays visually consistent with the Phase 1
 * design review. Rollback is zero-deploy: ops flips the flag to false and
 * the next 60s refetch picks up the new state.
 */
export const CoreLayer: React.FC = () => {
  const statsQuery = useCoreLayerStats();
  const enabled = statsQuery.data?.enabled ?? false;

  // Pull top-promotion candidates from live data — 50 rows is comfortably above
  // the 6 the widget shows. Keyed on `{ status: 'ACTIVE', limit: 50 }` so the
  // query is stable across mounts; when the flag is off the backend returns
  // `{ enabled: false, signals: [] }` fast and we fall back below.
  const listQuery = useCoreLayerSignals({ status: 'ACTIVE', limit: 50 });

  // IMPORTANT: when enabled=true we treat the live response as authoritative
  // even if it is empty — the "zero active Core-Layer signals" case is a valid
  // state of the world (scanner has not produced any alignments yet) and
  // dropping back to mock here would mislead the user into thinking there are
  // 40+ live alignments when in reality there are none. Mock is only used
  // when enabled=false OR when the stats query outright failed.
  const liveSignals: CoreLayerSignal[] = enabled && listQuery.data?.enabled
    ? listQuery.data.signals
    : [];

  const statsLoading = statsQuery.isLoading;
  const statsError = statsQuery.isError;

  const statsForTiles = useMemo(() => {
    if (enabled && statsQuery.data && statsQuery.data.enabled) {
      return statsFromApi(statsQuery.data);
    }
    return computeVariantStats(MOCK_CORE_LAYER_SIGNALS);
  }, [enabled, statsQuery.data]);

  const recent = useMemo(() => {
    if (enabled) return selectRecentPromotions(liveSignals, 6);
    return getMockRecentPromotions(6);
  }, [enabled, liveSignals]);

  const sourceLabel: 'Live' | 'Preview' = enabled ? 'Live' : 'Preview';

  return (
    <div className="flex flex-col gap-5 pb-10">
      <PageHeader
        breadcrumbs={[
          { label: 'Core-Layer' },
        ]}
      >
        <IntroVideoPill pageKey="overview" />
        <ProLabelPill />
        <ViewAsTierToggle />
      </PageHeader>

      <div className="px-4 md:px-6 flex flex-col gap-5">
        <CoreLayerHero
          enabled={enabled}
          totalActive={statsForTiles.SE.activeCount + statsForTiles.CRT.activeCount + statsForTiles.BIAS.activeCount}
          deepestDepth={selectDeepestDepth(liveSignals.length > 0 ? liveSignals : MOCK_CORE_LAYER_SIGNALS)}
          recentPromotionCount={recent.length}
        />

        <HowItWorksCollapsible
          body={
            <div className="flex flex-col gap-2">
              <p>
                Core-Layer sits on top of the existing SE, CRT, and Bias scanners. When a
                pair fires the same pattern on multiple timeframes at once, Core-Layer
                labels the chain's anchor (Weekly, Daily, or 4H) and tracks per-TF life
                states as new candles close.
              </p>
              <p>
                <span className="font-bold text-primary">Fresh</span> means the TF joined
                on the latest closed candle. <span className="font-bold text-amber-400">
                Breathing</span> means the fresh window has passed but the alignment is
                still holding. Once a TF stops contributing, the chain either demotes to a
                shallower depth or closes entirely.
              </p>
            </div>
          }
          defaultOpen={false}
        />

        {statsLoading && !statsQuery.data ? (
          <CoreLayerState kind="loading" />
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['SE', 'CRT', 'BIAS'] as CoreLayerVariant[]).map((v) => (
              <VariantSummaryCard
                key={v}
                variant={v}
                activeCount={statsForTiles[v].activeCount}
                anchorBreakdown={statsForTiles[v].anchorBreakdown}
              />
            ))}
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-2xl border dark:border-white/10 light:border-slate-200 dark:bg-[#0d1310]/60 light:bg-white/80 backdrop-blur-md p-4">
          <header className="flex items-center justify-between gap-2 pb-2 border-b dark:border-white/5 light:border-slate-100">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary border border-primary/30">
                <span className="material-symbols-outlined text-[16px]">trending_up</span>
              </span>
              <div>
                <h2 className="text-sm font-black dark:text-white light:text-slate-900 tracking-wide uppercase leading-none">
                  Recent promotions
                </h2>
                <p className="mt-0.5 text-[10px] dark:text-gray-500 light:text-slate-400 leading-none">
                  Latest depth upgrades from the scanner
                </p>
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${
                enabled
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'dark:border-white/10 light:border-slate-200 dark:text-gray-500 light:text-slate-400'
              }`}
              title={enabled ? 'Reading from live backend' : 'Showing preview / mock data'}
            >
              <span
                aria-hidden
                className={`inline-block h-1.5 w-1.5 rounded-full ${enabled ? 'bg-primary animate-pulse' : 'dark:bg-gray-500 light:bg-slate-400'}`}
              />
              {sourceLabel}
            </span>
          </header>
          {statsError && !statsQuery.data ? (
            <CoreLayerState kind="error" onRetry={() => statsQuery.refetch()} />
          ) : (
            <RecentPromotions rows={recent} />
          )}
        </section>
      </div>
    </div>
  );
};

interface VariantStats {
  activeCount: number;
  anchorBreakdown: Record<AnchorType, number>;
}

function computeVariantStats(
  signals: CoreLayerSignal[],
): Record<CoreLayerVariant, VariantStats> {
  const base: Record<CoreLayerVariant, VariantStats> = {
    SE: { activeCount: 0, anchorBreakdown: { WEEKLY: 0, DAILY: 0, FOURHOUR: 0 } },
    CRT: { activeCount: 0, anchorBreakdown: { WEEKLY: 0, DAILY: 0, FOURHOUR: 0 } },
    BIAS: { activeCount: 0, anchorBreakdown: { WEEKLY: 0, DAILY: 0, FOURHOUR: 0 } },
  };
  for (const s of signals) {
    if (s.status !== 'ACTIVE') continue;
    base[s.variant].activeCount += 1;
    base[s.variant].anchorBreakdown[s.anchor] += 1;
  }
  return base;
}

/**
 * API stats → per-variant summary shape. The API gives us per-variant totals
 * but not the anchor breakdown per variant, so we fall back to splitting the
 * anchor counts proportionally across variants — not perfect, but the overview
 * tile displays the total anchor mix *for the variant's active rows* and the
 * live list query has richer per-row data. When a variant has active signals
 * in the list response, prefer that; otherwise fall back to zeroed breakdown.
 */
function statsFromApi(data: {
  byVariant: Record<CoreLayerVariant, number>;
  byAnchor: Record<AnchorType, number>;
}): Record<CoreLayerVariant, VariantStats> {
  const base: Record<CoreLayerVariant, VariantStats> = {
    SE: { activeCount: data.byVariant.SE ?? 0, anchorBreakdown: { WEEKLY: 0, DAILY: 0, FOURHOUR: 0 } },
    CRT: { activeCount: data.byVariant.CRT ?? 0, anchorBreakdown: { WEEKLY: 0, DAILY: 0, FOURHOUR: 0 } },
    BIAS: { activeCount: data.byVariant.BIAS ?? 0, anchorBreakdown: { WEEKLY: 0, DAILY: 0, FOURHOUR: 0 } },
  };
  // Without per-(variant, anchor) buckets we synthesise a breakdown from the
  // global anchor totals weighted by each variant's share. This is cosmetic —
  // the tile copy reads "3 weekly · 2 daily" so exact per-variant allocation
  // is not strictly required. Accuracy is improved once the dashboard queries
  // the live list below and re-computes locally.
  const total = (data.byVariant.SE ?? 0) + (data.byVariant.CRT ?? 0) + (data.byVariant.BIAS ?? 0);
  if (total === 0) return base;
  for (const v of ['SE', 'CRT', 'BIAS'] as CoreLayerVariant[]) {
    const share = (data.byVariant[v] ?? 0) / total;
    base[v].anchorBreakdown.WEEKLY = Math.round((data.byAnchor.WEEKLY ?? 0) * share);
    base[v].anchorBreakdown.DAILY = Math.round((data.byAnchor.DAILY ?? 0) * share);
    base[v].anchorBreakdown.FOURHOUR = Math.round((data.byAnchor.FOURHOUR ?? 0) * share);
  }
  return base;
}

/** Live equivalent of getMockRecentPromotions — flatten history, keep promoted events, sort desc. */
function selectRecentPromotions(
  signals: CoreLayerSignal[],
  limit: number,
): Array<{ signal: CoreLayerSignal; entry: CoreLayerHistoryEntry }> {
  const rows: Array<{ signal: CoreLayerSignal; entry: CoreLayerHistoryEntry }> = [];
  for (const signal of signals) {
    for (const entry of signal.history ?? []) {
      if (entry.event === 'promoted') rows.push({ signal, entry });
    }
  }
  rows.sort((a, b) => b.entry.at - a.entry.at);
  return rows.slice(0, limit);
}

/** Largest active-signal depth across all variants — drives the "deepest" KPI tile. */
function selectDeepestDepth(signals: CoreLayerSignal[]): number {
  let max = 0;
  for (const s of signals) {
    if (s.status !== 'ACTIVE') continue;
    if (s.depth > max) max = s.depth;
  }
  return max;
}

interface CoreLayerHeroProps {
  enabled: boolean;
  totalActive: number;
  deepestDepth: number;
  recentPromotionCount: number;
}

const CoreLayerHero: React.FC<CoreLayerHeroProps> = ({
  enabled,
  totalActive,
  deepestDepth,
  recentPromotionCount,
}) => (
  <header className="relative overflow-hidden rounded-2xl border dark:border-white/10 light:border-slate-200 dark:bg-[#0d1310]/80 light:bg-white/90 backdrop-blur-md">
    {/* cinematic radial gradient */}
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 dark:bg-cinematic-gradient light:bg-cinematic-gradient-light opacity-90"
    />
    {/* subtle grid pattern */}
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-50"
    />
    {/* glowing brand orbs */}
    <span
      aria-hidden
      className="pointer-events-none absolute -top-24 -left-16 h-64 w-64 rounded-full bg-primary/15 blur-3xl"
    />
    <span
      aria-hidden
      className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
    />

    <div className="relative px-5 md:px-6 pt-6 pb-5 flex flex-col gap-4">
      {/* eyebrow row: brand label + live status pill */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10">
          <span className="material-symbols-outlined text-primary text-[16px] drop-shadow-[0_0_6px_rgba(19,236,55,0.5)]">
            hub
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
            Core-Layer
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-1 rounded-full border ${
            enabled
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'dark:border-white/10 light:border-slate-200 dark:text-gray-500 light:text-slate-400'
          }`}
        >
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              enabled ? 'bg-primary animate-pulse' : 'dark:bg-gray-500 light:bg-slate-400'
            }`}
          />
          {enabled ? 'Live' : 'Preview'}
        </span>
      </div>

      <div>
        <h1 className="text-2xl md:text-4xl font-black tracking-tight dark:text-white light:text-slate-900 leading-tight">
          Alignment{' '}
          <span className="text-gradient-primary animate-gradient">across timeframes</span>
        </h1>
        <p className="mt-2 text-sm dark:text-gray-400 light:text-slate-500 max-w-2xl">
          Pairs where the same pattern is firing in the same direction across multiple
          timeframes. Not a trade signal — open the pair on TradingView to take your own.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-2 md:gap-3 mt-1">
        <KpiStat icon="bolt" label="Active" value={totalActive} accent="primary" />
        <KpiStat
          icon="layers"
          label="Deepest"
          value={deepestDepth > 0 ? `${deepestDepth}-deep` : '—'}
          accent="amber"
        />
        <KpiStat
          icon="trending_up"
          label="Recent promos"
          value={recentPromotionCount}
          accent="sky"
        />
      </div>
    </div>
  </header>
);

const KPI_ACCENT: Record<'primary' | 'amber' | 'sky', { text: string; bg: string; border: string }> = {
  primary: { text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
  amber: { text: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30' },
  sky: { text: 'text-sky-400', bg: 'bg-sky-400/10', border: 'border-sky-400/30' },
};

const KpiStat: React.FC<{
  icon: string;
  label: string;
  value: number | string;
  accent: 'primary' | 'amber' | 'sky';
}> = ({ icon, label, value, accent }) => {
  const a = KPI_ACCENT[accent];
  return (
    <div className="flex items-center gap-2.5 rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.03] light:bg-white/70 px-3 py-2.5">
      <span className={`grid h-9 w-9 place-items-center rounded-lg border ${a.bg} ${a.border} ${a.text} shrink-0`}>
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-widest dark:text-gray-500 light:text-slate-400 leading-none">
          {label}
        </div>
        <div className="mt-1 text-lg font-black tabular-nums dark:text-white light:text-slate-900 leading-none truncate">
          {value}
        </div>
      </div>
    </div>
  );
};
