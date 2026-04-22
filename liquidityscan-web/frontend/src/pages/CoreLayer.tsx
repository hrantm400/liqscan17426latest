import React, { useMemo } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { VariantSummaryCard } from '../components/core-layer/VariantSummaryCard';
import { RecentPromotions } from '../components/core-layer/RecentPromotions';
import { HowItWorksCollapsible } from '../components/core-layer/HowItWorksCollapsible';
import { ProLabelPill } from '../components/subscriptions/ProLabelPill';
import { ViewAsTierToggle } from '../components/core-layer/ViewAsTierToggle';
import {
  MOCK_CORE_LAYER_SIGNALS,
  getMockRecentPromotions,
} from '../core-layer/mockCoreLayerData';
import type { AnchorType, CoreLayerSignal, CoreLayerVariant } from '../core-layer/types';

/**
 * `/core-layer` — overview page. Three variant tiles, a recent-promotions
 * widget, and an educational collapsible. Gateway into each variant's
 * deep-dive page.
 */
export const CoreLayer: React.FC = () => {
  const stats = useMemo(() => computeVariantStats(MOCK_CORE_LAYER_SIGNALS), []);
  const recent = useMemo(() => getMockRecentPromotions(6), []);

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Phase 2: <IntroVideoPill pageKey="overview" /> */}
      <PageHeader
        breadcrumbs={[
          { label: 'Core-Layer' },
        ]}
      >
        <ProLabelPill />
        <ViewAsTierToggle />
      </PageHeader>

      <div className="px-4 md:px-6 flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl md:text-3xl font-black dark:text-white light:text-slate-900 tracking-tight">
            Core-Layer — alignment across timeframes
          </h1>
          <p className="text-sm dark:text-gray-400 light:text-slate-500 max-w-2xl">
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

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['SE', 'CRT', 'BIAS'] as CoreLayerVariant[]).map((v) => (
            <VariantSummaryCard
              key={v}
              variant={v}
              activeCount={stats[v].activeCount}
              anchorBreakdown={stats[v].anchorBreakdown}
            />
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <header className="flex items-center justify-between">
            <h2 className="text-sm font-black dark:text-white light:text-slate-900 tracking-wide uppercase">
              Recent promotions
            </h2>
            <span className="text-[11px] font-mono dark:text-gray-500 light:text-slate-400">
              Just now · ↻
            </span>
          </header>
          <RecentPromotions rows={recent} />
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
