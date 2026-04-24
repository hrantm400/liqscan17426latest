import React, { useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { CoreLayerChartTile } from '../components/core-layer/CoreLayerChartTile';
import { CorrelationBadge } from '../components/core-layer/CorrelationBadge';
import { PlusBadge } from '../components/core-layer/PlusBadge';
import { UpgradeModal, buildVisibleChainString } from '../components/core-layer/UpgradeModal';
import { HowItWorksCollapsible } from '../components/core-layer/HowItWorksCollapsible';
import { ProLabelPill } from '../components/subscriptions/ProLabelPill';
import { ViewAsTierToggle } from '../components/core-layer/ViewAsTierToggle';
import { IntroVideoPill } from '../components/core-layer/IntroVideoPill';
import { CoreLayerState } from '../components/core-layer/CoreLayerState';
import { getMockSignalByPair } from '../core-layer/mockCoreLayerData';
import { chainHasProTf } from '../core-layer/helpers';
import { VARIANT_FROM_SLUG, VARIANT_META, ANCHOR_META, MOCK_NOW } from '../core-layer/constants';
import { useCoreLayerTier } from '../core-layer/TierContext';
import {
  useCoreLayerSignal,
  useCoreLayerSignalByPair,
  useCoreLayerStats,
} from '../hooks/useCoreLayer';
import type { CoreLayerHistoryEntry } from '../core-layer/types';

/**
 * `/core-layer/:variant/:pair` — pair detail page.
 *
 * The page renders a responsive CSS grid of per-TF charts (one tile per TF in
 * the chain). Each tile owns its own header (TF · life pill · pattern · time),
 * signal-candle highlight, and "Open in TradingView" link — TF metadata lives
 * in the chart headers themselves (Phase 1 redesign).
 *
 * Base users attempting to open a Pro-gated pair are intercepted by an
 * `UpgradeModal` in blocking mode. In v1 no pair is Pro-gated because mock
 * data never populates sub-1h TFs; the gate lives here for Phase 7.
 */
export const CoreLayerPair: React.FC = () => {
  const { variant: variantSlug, pair } = useParams<{ variant: string; pair: string }>();
  const variant = variantSlug ? VARIANT_FROM_SLUG[variantSlug] : undefined;
  const { tier } = useCoreLayerTier();

  // Live source wiring:
  //   1. Stats query carries the `enabled` truth.
  //   2. By-pair query uses the Phase 5 `pair` filter to resolve (variant, pair)
  //      → signal id cheaply.
  //   3. Detail query re-fetches the full row so history is not capped at 20.
  //   4. Fallback to getMockSignalByPair when enabled=false OR the live lookups
  //      turn up nothing (graceful degrade — keeps existing direct-link URLs
  //      from going dead during a rollback).
  const statsQuery = useCoreLayerStats();
  const enabled = statsQuery.data?.enabled ?? false;
  const byPairQuery = useCoreLayerSignalByPair(
    enabled ? variant : undefined,
    enabled ? pair : undefined,
  );
  const signalId = byPairQuery.data?.id;
  const detailQuery = useCoreLayerSignal(enabled ? signalId : undefined);
  const liveSignal = detailQuery.data ?? byPairQuery.data ?? null;
  const isLive = enabled && Boolean(liveSignal);

  const signal = useMemo(() => {
    if (enabled && liveSignal) return liveSignal;
    return variant && pair ? getMockSignalByPair(variant, pair) : undefined;
  }, [enabled, liveSignal, variant, pair]);

  // `enabled` is derived from `statsQuery.data?.enabled ?? false`, so it
  // reads `false` on a cold load until stats resolves. We must NOT decide
  // anything about live-lookup state until stats has answered — otherwise a
  // direct-nav cold load races the stats fetch and lands in the "no signal"
  // branch below before the live by-pair lookup ever runs.
  const statsResolved = statsQuery.isFetched || statsQuery.isError;
  const liveLookupFinished =
    statsResolved &&
    (!enabled ||
      (byPairQuery.isFetched && !byPairQuery.isLoading && !detailQuery.isLoading));
  const liveLookupFailed =
    enabled && liveLookupFinished && !liveSignal && !byPairQuery.isError;

  if (!variant) return <Navigate to="/core-layer" replace />;

  // Loading: stats not yet resolved (cold-load direct-nav races it), OR
  // stats said enabled=true but the by-pair / detail lookups are still in
  // flight, AND we have no cached/mock result to render from. Without the
  // first clause, a direct nav to /core-layer/<variant>/<pair> for a pair
  // that's not in the mock seed would bounce to /core-layer/<variant>
  // before the live lookup ever ran.
  if (!signal && (!statsResolved || (enabled && !liveLookupFinished))) {
    return (
      <div className="flex flex-col gap-5 pb-10">
        <PageHeader breadcrumbs={[{ label: 'Core-Layer', path: '/core-layer' }, { label: pair ?? '' }]}>
          <IntroVideoPill pageKey="pair" />
          <ProLabelPill />
          <ViewAsTierToggle />
        </PageHeader>
        <div className="px-4 md:px-6">
          <CoreLayerState kind="loading" />
        </div>
      </div>
    );
  }

  // Live said "no such pair" and mock has nothing either → bounce to variant page.
  if (!signal) {
    if (enabled && liveLookupFailed) {
      return <Navigate to={`/core-layer/${variantSlug}`} replace />;
    }
    return <Navigate to={`/core-layer/${variantSlug}`} replace />;
  }

  const variantMeta = VARIANT_META[variant];
  const anchorMeta = ANCHOR_META[signal.anchor];
  const isProGated = chainHasProTf(signal.chain);
  const blockingUpgrade = isProGated && tier === 'base';
  const chartNow = isLive ? Date.now() : MOCK_NOW;

  const directionColor = signal.direction === 'BUY' ? 'text-primary' : 'text-red-400';
  // Price / change24h are placeholders on the live DTO (ADR — ticker
  // enrichment is out of scope for Phase 5). Render "—" when zero and live
  // so users do not see a misleading "0.00 · +0.00%".
  const priceDisplay = isLive && signal.price === 0 ? '—' : formatPrice(signal.price);
  const change24hDisplay =
    isLive && signal.change24h === 0
      ? '—'
      : `${signal.change24h >= 0 ? '+' : ''}${signal.change24h.toFixed(2)}% 24h`;
  const change24hColor = isLive && signal.change24h === 0
    ? 'dark:text-gray-500 light:text-slate-400'
    : signal.change24h >= 0
      ? 'text-primary'
      : 'text-red-400';

  return (
    <div className="flex flex-col gap-5 pb-10">
      <PageHeader
        breadcrumbs={[
          { label: 'Core-Layer', path: '/core-layer' },
          { label: variantMeta.label, path: `/core-layer/${variantMeta.urlSlug}` },
          { label: signal.pair },
        ]}
      >
        <IntroVideoPill pageKey="pair" />
        <ProLabelPill />
        <ViewAsTierToggle />
      </PageHeader>

      <div className="px-4 md:px-6 flex flex-col gap-5">
        <header className="relative overflow-hidden rounded-2xl border dark:border-white/10 light:border-slate-200 dark:bg-[#0d1310]/80 light:bg-white/90 backdrop-blur-md">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 dark:bg-cinematic-gradient light:bg-cinematic-gradient-light opacity-90"
          />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-50" />
          <span
            aria-hidden
            className={`pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full blur-3xl ${
              signal.direction === 'BUY' ? 'bg-primary/15' : 'bg-red-500/15'
            }`}
          />

          <div className="relative px-5 md:px-6 pt-6 pb-5 flex flex-col gap-4">
            {/* eyebrow row */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10">
                <span className="material-symbols-outlined text-primary text-[16px] drop-shadow-[0_0_6px_rgba(19,236,55,0.5)]">
                  {variantMeta.icon}
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                  {variantMeta.shortLabel} · {anchorMeta.shortLabel}-anchored
                </span>
              </div>
              {signal.plusSummary && <PlusBadge summary={signal.plusSummary} />}
            </div>

            {/* pair name + direction badge + price */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-3xl md:text-4xl font-black dark:text-white light:text-slate-900 tracking-tight leading-none">
                    {signal.pair}
                  </h1>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-[0.18em] px-2 py-1 rounded-md border leading-none ${
                      signal.direction === 'BUY'
                        ? 'bg-primary/10 text-primary border-primary/30 shadow-[0_0_12px_-2px_rgba(19,236,55,0.4)]'
                        : 'bg-red-500/10 text-red-400 border-red-500/30 shadow-[0_0_12px_-2px_rgba(239,68,68,0.4)]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {signal.direction === 'BUY' ? 'trending_up' : 'trending_down'}
                    </span>
                    {signal.direction}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-3 flex-wrap">
                  <span className="font-mono text-2xl font-bold dark:text-white light:text-slate-900 tabular-nums">
                    {priceDisplay}
                  </span>
                  <span className={`font-bold text-sm tabular-nums ${change24hColor}`}>
                    {change24hDisplay}
                  </span>
                </div>
              </div>

              {/* correlation badges sit right */}
              {signal.correlationPairs.length > 0 && (
                <div className="flex items-center flex-wrap gap-1.5 md:justify-end">
                  {signal.correlationPairs.map(([a, b]) => (
                    <CorrelationBadge key={`${a}-${b}`} pair={[a, b]} />
                  ))}
                </div>
              )}
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mt-1">
              <PairStat icon="layers" label="Depth" value={`${signal.depth}-deep`} accent="primary" />
              <PairStat icon="anchor" label="Anchor" value={anchorMeta.shortLabel} accent="amber" />
              <PairStat
                icon="bolt"
                label="Status"
                value={signal.status === 'ACTIVE' ? 'Active' : 'Closed'}
                accent={signal.status === 'ACTIVE' ? 'primary' : 'sky'}
              />
              <PairStat
                icon="schedule"
                label="Detected"
                value={formatRelativeAgo(signal.detectedAt, chartNow)}
                accent="sky"
              />
            </div>
          </div>
        </header>

        {/* Per-TF chart grid (Phase 1 redesign). */}
        <section className="flex flex-col gap-3">
          <SectionHeader
            icon="bar_chart"
            title="Chain"
            subtitle={signal.chain.join(' → ')}
          />
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
          >
            {signal.chain.map((tf) => (
              <CoreLayerChartTile key={tf} signal={signal} tf={tf} now={chartNow} />
            ))}
          </div>
        </section>

        <section className="flex flex-wrap gap-2">
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
          <SectionHeader icon="history" title="History" subtitle={`${signal.history.length} events`} />
          <ol className="flex flex-col gap-2">
            {signal.history.map((entry, i) => {
              const tone = HISTORY_TONE[entry.event] ?? HISTORY_TONE.created;
              return (
                <li
                  key={`${entry.event}-${entry.at}-${i}`}
                  className="group relative flex items-start gap-3 rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.02] light:bg-white/70 px-3 py-2.5 transition-colors hover:border-primary/30"
                >
                  <span
                    aria-hidden
                    className={`absolute inset-y-2 left-0 w-0.5 rounded-r ${tone.bar}`}
                  />
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-lg border shrink-0 ${tone.icon}`}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {historyIcon(entry.event)}
                    </span>
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold dark:text-gray-200 light:text-slate-700">
                      {describeHistory(entry)}
                    </div>
                    <div className="text-[10px] font-mono dark:text-gray-500 light:text-slate-400 mt-0.5">
                      {new Date(entry.at).toISOString().replace('T', ' ').slice(0, 16)} UTC
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <HowItWorksCollapsible
          body={
            <div className="flex flex-col gap-2">
              <p>
                Each tile above is one timeframe in the chain, deepest at the bottom. The
                thick candle on the right of every chart is the signal candle — the close
                that classified this TF. The arrow below it colors the TF's life state:
                green when the signal just closed (fresh), amber while it's still
                "breathing" (1/2 or 2/2), gray once steady.
              </p>
              <p>
                Tile borders echo the same signal: green for fresh, yellow-amber for
                breathing 1/2, darker amber for breathing 2/2, hairline for steady. The
                history timeline below is built from real promotion / demotion / anchor
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
    className="group inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.03] light:bg-white/70 backdrop-blur-sm text-xs font-bold dark:text-gray-200 light:text-slate-700 transition-all hover:border-primary/40 hover:text-primary hover:shadow-glow"
  >
    <span className="material-symbols-outlined text-[16px] transition-transform group-hover:scale-110">
      {icon}
    </span>
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

function formatRelativeAgo(ts: number, now: number): string {
  const dt = now - ts;
  if (dt < 0) return 'just now';
  const mins = Math.max(1, Math.round(dt / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const PAIR_STAT_ACCENT: Record<'primary' | 'amber' | 'sky', { text: string; bg: string; border: string }> = {
  primary: { text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
  amber: { text: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30' },
  sky: { text: 'text-sky-400', bg: 'bg-sky-400/10', border: 'border-sky-400/30' },
};

const PairStat: React.FC<{
  icon: string;
  label: string;
  value: string;
  accent: 'primary' | 'amber' | 'sky';
}> = ({ icon, label, value, accent }) => {
  const a = PAIR_STAT_ACCENT[accent];
  return (
    <div className="flex items-center gap-2.5 rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.03] light:bg-white/70 px-3 py-2.5">
      <span className={`grid h-9 w-9 place-items-center rounded-lg border ${a.bg} ${a.border} ${a.text} shrink-0`}>
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-widest dark:text-gray-500 light:text-slate-400 leading-none">
          {label}
        </div>
        <div className="mt-1 text-sm font-black dark:text-white light:text-slate-900 leading-none truncate">
          {value}
        </div>
      </div>
    </div>
  );
};

const SectionHeader: React.FC<{ icon: string; title: string; subtitle?: string }> = ({
  icon,
  title,
  subtitle,
}) => (
  <div className="flex items-center gap-2 pb-2 border-b dark:border-white/5 light:border-slate-100">
    <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary border border-primary/30">
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
    </span>
    <div>
      <h2 className="text-sm font-black dark:text-white light:text-slate-900 tracking-wide uppercase leading-none">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-0.5 text-[10px] dark:text-gray-500 light:text-slate-400 leading-none font-mono">
          {subtitle}
        </p>
      )}
    </div>
  </div>
);

const HISTORY_TONE: Record<
  CoreLayerHistoryEntry['event'],
  { bar: string; icon: string }
> = {
  created: {
    bar: 'bg-sky-400/70',
    icon: 'bg-sky-400/10 border-sky-400/30 text-sky-400',
  },
  promoted: {
    bar: 'bg-primary/70',
    icon: 'bg-primary/10 border-primary/30 text-primary',
  },
  demoted: {
    bar: 'bg-amber-400/70',
    icon: 'bg-amber-400/10 border-amber-400/30 text-amber-400',
  },
  anchor_changed: {
    bar: 'bg-fuchsia-400/70',
    icon: 'bg-fuchsia-400/10 border-fuchsia-400/30 text-fuchsia-400',
  },
  closed: {
    bar: 'bg-red-500/70',
    icon: 'bg-red-500/10 border-red-500/30 text-red-400',
  },
};
