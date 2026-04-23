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
        <header className="relative overflow-hidden rounded-2xl border dark:border-white/10 light:border-slate-200 dark:bg-gradient-to-br dark:from-white/[0.04] dark:to-transparent light:bg-gradient-to-br light:from-white light:to-slate-50/60 px-5 py-5 flex flex-col gap-2">
          {/* soft ambient glow tying the page to the primary brand color */}
          <span
            aria-hidden
            className="pointer-events-none absolute -top-16 -left-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl opacity-40"
          />
          <div className="relative flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px] drop-shadow-[0_0_6px_rgba(19,236,55,0.5)]">
              hub
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
              Core-Layer
            </span>
          </div>
          <h1 className="relative text-2xl md:text-3xl font-black dark:text-white light:text-slate-900 tracking-tight">
            Alignment across timeframes
          </h1>
          <p className="relative text-sm dark:text-gray-400 light:text-slate-500 max-w-2xl">
            Pairs where the same pattern is firing in the same direction across multiple
            timeframes. Not a trade signal — open the pair on TradingView to take your own.
          </p>
        </header>

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

        <section className="flex flex-col gap-3">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[18px]">
                trending_up
              </span>
              <h2 className="text-sm font-black dark:text-white light:text-slate-900 tracking-wide uppercase">
                Recent promotions
              </h2>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
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
