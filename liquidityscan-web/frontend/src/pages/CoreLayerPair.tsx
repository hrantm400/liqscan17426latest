import React, { useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { TFStack } from '../components/core-layer/TFStack';
import { CoreLayerChart } from '../components/core-layer/CoreLayerChart';
import { LifeStatePill } from '../components/core-layer/LifeStatePill';
import { CorrelationBadge } from '../components/core-layer/CorrelationBadge';
import { PlusBadge } from '../components/core-layer/PlusBadge';
import { UpgradeModal, buildVisibleChainString } from '../components/core-layer/UpgradeModal';
import { HowItWorksCollapsible } from '../components/core-layer/HowItWorksCollapsible';
import { ProLabelPill } from '../components/subscriptions/ProLabelPill';
import { ViewAsTierToggle } from '../components/core-layer/ViewAsTierToggle';
import { getMockSignalByPair } from '../core-layer/mockCoreLayerData';
import { chainHasProTf, deepestTf } from '../core-layer/helpers';
import { VARIANT_FROM_SLUG, VARIANT_META, ANCHOR_META } from '../core-layer/constants';
import { useCoreLayerTier } from '../core-layer/TierContext';
import type { CoreLayerHistoryEntry, TF } from '../core-layer/types';

/**
 * `/core-layer/:variant/:pair` — pair detail page. TFStack selects the active
 * TF (default = deepest in the chain, spec line 139); chart redraws per TF;
 * action row stubs open external links; history prose timeline renders from
 * the signal's own `history` array (spec line 250).
 *
 * Base users attempting to open a Pro-gated pair are intercepted by an
 * `UpgradeModal` in blocking mode. In v1 no pair is Pro-gated because mock
 * data never populates sub-1h TFs; the gate lives here for Phase 7.
 */
export const CoreLayerPair: React.FC = () => {
  const { variant: variantSlug, pair } = useParams<{ variant: string; pair: string }>();
  const variant = variantSlug ? VARIANT_FROM_SLUG[variantSlug] : undefined;
  const { tier } = useCoreLayerTier();

  const signal = useMemo(
    () => (variant && pair ? getMockSignalByPair(variant, pair) : undefined),
    [variant, pair],
  );

  const defaultTf: TF | undefined = signal ? deepestTf(signal.chain) : undefined;
  const [activeTf, setActiveTf] = useState<TF | undefined>(defaultTf);

  React.useEffect(() => {
    setActiveTf(defaultTf);
  }, [defaultTf]);

  if (!variant) return <Navigate to="/core-layer" replace />;
  if (!signal) return <Navigate to={`/core-layer/${variantSlug}`} replace />;

  const variantMeta = VARIANT_META[variant];
  const anchorMeta = ANCHOR_META[signal.anchor];
  const isProGated = chainHasProTf(signal.chain);
  const blockingUpgrade = isProGated && tier === 'base';

  const directionColor = signal.direction === 'BUY' ? 'text-primary' : 'text-red-400';
  const change24hColor = signal.change24h >= 0 ? 'text-primary' : 'text-red-400';
  const currentTf = activeTf ?? defaultTf ?? signal.chain[0];

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Phase 2: <IntroVideoPill pageKey="pair" /> */}
      <PageHeader
        breadcrumbs={[
          { label: 'Core-Layer', path: '/core-layer' },
          { label: variantMeta.label, path: `/core-layer/${variantMeta.urlSlug}` },
          { label: signal.pair },
        ]}
      >
        <ProLabelPill />
        <ViewAsTierToggle />
      </PageHeader>

      <div className="px-4 md:px-6 flex flex-col gap-5">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black dark:text-white light:text-slate-900 tracking-tight">
                {signal.pair}
              </h1>
              <span
                className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                  signal.direction === 'BUY'
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-red-500/10 text-red-400 border-red-500/30'
                }`}
              >
                {signal.direction}
              </span>
              <span className="text-[11px] font-mono font-bold dark:text-gray-500 light:text-slate-400">
                {anchorMeta.emoji} {anchorMeta.shortLabel} · {signal.depth}-deep
              </span>
              {signal.plusSummary && <PlusBadge summary={signal.plusSummary} />}
            </div>
            <div className="mt-2 flex items-center gap-3 text-sm">
              <span className="font-mono dark:text-gray-200 light:text-slate-700">
                {formatPrice(signal.price)}
              </span>
              <span className={`font-bold ${change24hColor}`}>
                {signal.change24h >= 0 ? '+' : ''}
                {signal.change24h.toFixed(2)}% 24h
              </span>
              <span className={`font-bold ${directionColor}`}>
                {variantMeta.shortLabel}
              </span>
            </div>
          </div>
          <div className="flex items-center flex-wrap gap-1.5">
            {signal.correlationPairs.map(([a, b]) => (
              <CorrelationBadge key={`${a}-${b}`} pair={[a, b]} />
            ))}
          </div>
        </header>

        <TFStack
          chain={signal.chain}
          tfLifeState={signal.tfLifeState}
          activeTf={currentTf}
          onSelect={setActiveTf}
        />

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black dark:text-white light:text-slate-900 tracking-wide uppercase">
              {signal.pair} · {currentTf}
            </h2>
            {signal.tfLifeState[currentTf] && currentTf !== 'W' && currentTf !== '1D' && (
              <LifeStatePill state={signal.tfLifeState[currentTf]!} />
            )}
          </div>
          <CoreLayerChart
            pair={signal.pair}
            tf={currentTf}
            direction={signal.direction}
            seedPrice={signal.price}
          />
        </section>

        <section className="flex flex-wrap gap-2">
          <ActionButton
            icon="open_in_new"
            label="Open on TradingView"
            onClick={() =>
              console.log('open TradingView', { pair: signal.pair, tf: currentTf })
            }
          />
          <ActionButton
            icon="star_border"
            label="Add to Watchlist"
            onClick={() => console.log('add watchlist', signal.pair)}
          />
          <ActionButton
            icon="notifications"
            label="Alert on promote"
            onClick={() => console.log('alert on promote', signal.pair)}
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-black dark:text-white light:text-slate-900 tracking-wide uppercase">
            History
          </h2>
          <ol className="flex flex-col gap-2">
            {signal.history.map((entry, i) => (
              <li
                key={`${entry.event}-${entry.at}-${i}`}
                className="flex items-start gap-3 rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.02] light:bg-white/70 px-3 py-2"
              >
                <span className="material-symbols-outlined text-primary text-[16px] mt-0.5 shrink-0">
                  {historyIcon(entry.event)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm dark:text-gray-200 light:text-slate-700">
                    {describeHistory(entry)}
                  </div>
                  <div className="text-[10px] font-mono dark:text-gray-500 light:text-slate-400 mt-0.5">
                    {new Date(entry.at).toISOString().replace('T', ' ').slice(0, 16)} UTC
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <HowItWorksCollapsible
          body={
            <div className="flex flex-col gap-2">
              <p>
                The TFStack above shows every TF Core-Layer tracks for this variant.
                Disabled cards are TFs where the pattern isn't firing. Clicking an active
                card re-draws the chart for that TF.
              </p>
              <p>
                The history timeline is built from real promotion / demotion / anchor
                events — nothing in here is computed on-the-fly, which is why a pair that
                closed 6h ago still has a clear paper trail.
              </p>
            </div>
          }
        />
      </div>

      <UpgradeModal
        open={blockingUpgrade}
        onClose={() => {
          /* blocking mode: user must upgrade or leave */
        }}
        pair={signal.pair}
        direction={signal.direction}
        depth={signal.depth}
        visibleChain={buildVisibleChainString(signal.chain.filter((tf) => tf !== '15m' && tf !== '5m'))}
        hiddenTfsCount={signal.chain.filter((tf) => tf === '15m' || tf === '5m').length}
        blocking
      />
    </div>
  );
};

interface ActionButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
}

const ActionButton: React.FC<ActionButtonProps> = ({ icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.03] light:bg-white/70 text-xs font-bold dark:text-gray-200 light:text-slate-700 transition-colors hover:border-primary/30 hover:text-primary"
  >
    <span className="material-symbols-outlined text-[16px]">{icon}</span>
    <span>{label}</span>
  </button>
);

function historyIcon(event: CoreLayerHistoryEntry['event']): string {
  switch (event) {
    case 'created':
      return 'fiber_new';
    case 'promoted':
      return 'trending_up';
    case 'demoted':
      return 'trending_down';
    case 'anchor_changed':
      return 'swap_vert';
    case 'closed':
      return 'stop_circle';
    default:
      return 'circle';
  }
}

function describeHistory(entry: CoreLayerHistoryEntry): string {
  switch (entry.event) {
    case 'created':
      return entry.note ?? 'Chain detected';
    case 'promoted':
      return `Promoted ${entry.fromDepth ?? '?'}-deep → ${entry.toDepth ?? '?'}-deep`;
    case 'demoted':
      return `Demoted ${entry.fromDepth ?? '?'}-deep → ${entry.toDepth ?? '?'}-deep${
        entry.tfRemoved ? ` (${entry.tfRemoved} fell off)` : ''
      }`;
    case 'anchor_changed':
      return `Anchor ${entry.fromAnchor ?? '?'} → ${entry.toAnchor ?? '?'}`;
    case 'closed':
      return entry.note ?? 'Chain closed — no valid anchor';
    default:
      return entry.note ?? 'Event';
  }
}

function formatPrice(n: number): string {
  if (n < 0.001) return n.toExponential(2);
  if (n < 1) return n.toFixed(4);
  if (n < 100) return n.toFixed(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
