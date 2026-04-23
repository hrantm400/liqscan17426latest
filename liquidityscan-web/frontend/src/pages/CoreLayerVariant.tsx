import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { AnchorSelectorCards } from '../components/core-layer/AnchorSelectorCards';
import { DepthGrid } from '../components/core-layer/DepthGrid';
import { HowItWorksCollapsible } from '../components/core-layer/HowItWorksCollapsible';
import { ProLabelPill } from '../components/subscriptions/ProLabelPill';
import { ViewAsTierToggle } from '../components/core-layer/ViewAsTierToggle';
import { UpgradeModal } from '../components/core-layer/UpgradeModal';
import { IntroVideoPill } from '../components/core-layer/IntroVideoPill';
import { CoreLayerState } from '../components/core-layer/CoreLayerState';
import { getMockSignalsByVariant } from '../core-layer/mockCoreLayerData';
import {
  ANCHOR_FROM_URL,
  ANCHOR_META,
  VARIANT_FROM_SLUG,
  VARIANT_META,
} from '../core-layer/constants';
import { useCoreLayerSignals, useCoreLayerStats } from '../hooks/useCoreLayer';
import type { AnchorType, CoreLayerSignal } from '../core-layer/types';

type TabView = 'all' | 'live' | 'closed';

const TABS: ReadonlyArray<{ key: TabView; label: string; icon: string }> = [
  { key: 'all', label: 'All', icon: 'select_all' },
  { key: 'live', label: 'Live', icon: 'radio_button_checked' },
  { key: 'closed', label: 'Recent Closed', icon: 'inventory_2' },
];

/**
 * `/core-layer/:variant` — deep-dive page. Anchor cards, depth grid, status
 * tabs, "only high-correlation" filter, and the Pro-upsell legend row per
 * spec line 144. URL params `?anchor=weekly|daily|fourhour&tab=all|live|closed`
 * are shareable and restore state on reload.
 *
 * Shift+P debug hotkey (dev only) triggers the one-shot promotion animation
 * on a random card — spec line 143.
 *
 * Phase 5: reads from the live backend via useCoreLayerSignals (keyed on
 * variant + status, anchor filtered client-side so AnchorSelectorCards can
 * render non-zero counts for inactive anchors). Falls back to
 * getMockSignalsByVariant when stats.enabled is false or the list query
 * fails — matches the rollback contract used on the overview page.
 */
export const CoreLayerVariant: React.FC = () => {
  const { variant: variantSlug } = useParams<{ variant: string }>();
  const variant = variantSlug ? VARIANT_FROM_SLUG[variantSlug] : undefined;
  const [searchParams, setSearchParams] = useSearchParams();
  const [highCorrelationOnly, setHighCorrelationOnly] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [justPromotedIds, setJustPromotedIds] = useState<Set<string>>(() => new Set());

  const anchorParam = searchParams.get('anchor') ?? '';
  const tabParam = (searchParams.get('tab') ?? 'all') as TabView;
  // ANCHOR_FROM_URL is typed `Record<string, AnchorType>` which TS treats as
  // total, so the nullish branch would be unreachable. Widen explicitly.
  const activeAnchor: AnchorType | 'all' =
    (ANCHOR_FROM_URL[anchorParam] as AnchorType | undefined) ?? 'all';
  const activeTab: TabView = TABS.some((t) => t.key === tabParam) ? tabParam : 'all';

  // Stats drives the live/mock source decision, consistent with the overview page.
  const statsQuery = useCoreLayerStats();
  const enabled = statsQuery.data?.enabled ?? false;

  // Fetch ACTIVE + CLOSED for the variant separately so the anchor counter
  // row and the three tabs all have their data without requery on tab flip.
  // Limit=200 comfortably covers realistic scale — backend caps at 200 and
  // the variant view's own design target is a handful of deeply-aligned pairs.
  const activeQuery = useCoreLayerSignals(
    variant ? { variant, status: 'ACTIVE', limit: 200 } : { limit: 1 },
  );
  const closedQuery = useCoreLayerSignals(
    variant ? { variant, status: 'CLOSED', limit: 200 } : { limit: 1 },
  );

  const liveSignals: CoreLayerSignal[] = useMemo(() => {
    if (!enabled) return [];
    const act = activeQuery.data?.enabled ? activeQuery.data.signals : [];
    const cls = closedQuery.data?.enabled ? closedQuery.data.signals : [];
    return [...act, ...cls];
  }, [enabled, activeQuery.data, closedQuery.data]);

  // Fallback to mock only when the flag is off. When the flag is on the live
  // response (including an empty one) is authoritative — see comment on
  // CoreLayer.tsx's liveSignals for the rationale.
  const allSignals: CoreLayerSignal[] = useMemo(() => {
    if (enabled) return liveSignals;
    return variant ? getMockSignalsByVariant(variant) : [];
  }, [enabled, liveSignals, variant]);

  const filtered = useMemo(() => {
    return allSignals.filter((s) => {
      if (activeTab === 'live' && s.status !== 'ACTIVE') return false;
      if (activeTab === 'closed' && s.status !== 'CLOSED') return false;
      if (activeAnchor !== 'all' && s.anchor !== activeAnchor) return false;
      if (highCorrelationOnly && s.correlationPairs.length === 0) return false;
      return true;
    });
  }, [allSignals, activeTab, activeAnchor, highCorrelationOnly]);

  const anchorCounts = useMemo(() => {
    const base: Record<AnchorType, number> = { WEEKLY: 0, DAILY: 0, FOURHOUR: 0 };
    for (const s of allSignals) {
      if (activeTab === 'live' && s.status !== 'ACTIVE') continue;
      if (activeTab === 'closed' && s.status !== 'CLOSED') continue;
      base[s.anchor] += 1;
    }
    return base;
  }, [allSignals, activeTab]);

  // Shift+P — dev-only promotion demo. Picks one visible active signal and
  // pulses it for 1.2s. Disabled in production per spec line 143.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const editable =
        tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if (e.shiftKey && (e.key === 'P' || e.key === 'p') && !editable) {
        const active = filtered.filter((s) => s.status === 'ACTIVE');
        if (active.length === 0) return;
        const pick = active[Math.floor(Math.random() * active.length)];
        setJustPromotedIds(new Set([pick.id]));
        setTimeout(() => setJustPromotedIds(new Set()), 1400);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filtered]);

  if (!variant) return <Navigate to="/core-layer" replace />;
  const variantMeta = VARIANT_META[variant];

  const setAnchor = (a: AnchorType | 'all') => {
    const next = new URLSearchParams(searchParams);
    if (a === 'all') next.delete('anchor');
    else next.set('anchor', ANCHOR_META[a].urlParam);
    setSearchParams(next);
  };

  const setTab = (t: TabView) => {
    const next = new URLSearchParams(searchParams);
    if (t === 'all') next.delete('tab');
    else next.set('tab', t);
    setSearchParams(next);
  };

  const isLoading = enabled && (activeQuery.isLoading || closedQuery.isLoading) && allSignals.length === 0;
  const isError = enabled && (activeQuery.isError || closedQuery.isError) && allSignals.length === 0;
  // Live + flag on + zero signals from the backend (across both ACTIVE and
  // CLOSED) → friendly empty copy instead of three dashed depth boxes. When
  // signals exist but filters narrow it to zero the DepthGrid's own dashed
  // columns are the right UX — the user can see which depth buckets exist.
  const isEmptyLive = enabled && !isLoading && !isError && allSignals.length === 0;

  return (
    <div className="flex flex-col gap-5 pb-10">
      <PageHeader
        breadcrumbs={[
          { label: 'Core-Layer', path: '/core-layer' },
          { label: variantMeta.label },
        ]}
      >
        <IntroVideoPill pageKey="deep-dive" />
        <ProLabelPill />
        <ViewAsTierToggle />
      </PageHeader>

      <div className="px-4 md:px-6 flex flex-col gap-5">
        <header className="relative overflow-hidden rounded-2xl border dark:border-white/10 light:border-slate-200 dark:bg-gradient-to-br dark:from-white/[0.04] dark:to-transparent light:bg-gradient-to-br light:from-white light:to-slate-50/60 px-5 py-5 flex flex-col gap-2">
          <span
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl opacity-50"
          />
          <div className="relative flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px] drop-shadow-[0_0_6px_rgba(19,236,55,0.5)]">
              {variantMeta.icon}
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
              {variantMeta.shortLabel} · Core-Layer
            </span>
          </div>
          <h1 className="relative text-2xl md:text-3xl font-black dark:text-white light:text-slate-900 tracking-tight">
            {variantMeta.label}
          </h1>
          <p className="relative text-sm dark:text-gray-400 light:text-slate-500">
            {variantMeta.tagline}
          </p>
        </header>

        <AnchorSelectorCards
          activeAnchor={activeAnchor}
          counts={anchorCounts}
          onSelect={setAnchor}
        />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.02] light:bg-white/70 px-3 py-2">
          <div
            className="flex items-center gap-1 p-1 rounded-lg dark:bg-black/30 light:bg-slate-100/80 border dark:border-white/5 light:border-slate-200 self-start"
            role="tablist"
            aria-label="Signal status filter"
          >
            {TABS.map((t) => {
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all ${
                    active
                      ? 'bg-primary/20 text-primary shadow-[0_0_10px_rgba(19,236,55,0.18)]'
                      : 'dark:text-gray-400 light:text-slate-500 hover:text-primary hover:bg-primary/5'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
          <label
            className={`inline-flex items-center gap-2 text-xs cursor-pointer select-none px-3 py-1.5 rounded-md transition-colors ${
              highCorrelationOnly
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'dark:text-gray-300 light:text-slate-600 border border-transparent hover:border-primary/20'
            }`}
            title="Show only chains where two TFs in the chain are a known correlation pair (e.g. 1D + 1H)."
          >
            <input
              type="checkbox"
              checked={highCorrelationOnly}
              onChange={(e) => setHighCorrelationOnly(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-transparent accent-primary"
            />
            <span className="material-symbols-outlined text-[14px]">link</span>
            <span>Only high-correlation chains</span>
          </label>
        </div>

        {isLoading ? (
          <CoreLayerState kind="loading" />
        ) : isError ? (
          <CoreLayerState
            kind="error"
            onRetry={() => {
              activeQuery.refetch();
              closedQuery.refetch();
            }}
          />
        ) : isEmptyLive ? (
          <CoreLayerState
            kind="empty"
            message={`No ${variantMeta.shortLabel} alignments active. The scanner runs hourly — check back next cycle.`}
          />
        ) : (
          <DepthGrid signals={filtered} justPromotedIds={justPromotedIds} />
        )}

        <button
          type="button"
          onClick={() => setUpgradeOpen(true)}
          className="group flex items-center justify-between gap-3 rounded-xl border dark:border-amber-400/20 light:border-amber-300/60 dark:bg-amber-500/[0.06] light:bg-amber-50/70 px-4 py-3 transition-colors hover:border-amber-400/50 hover:bg-amber-500/[0.1]"
        >
          <div className="flex items-center gap-3 min-w-0 text-left">
            <span className="material-symbols-outlined text-amber-400 text-[20px] shrink-0">
              workspace_premium
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                Sub-1h TFs are Pro
              </span>
              <span className="text-[11px] dark:text-gray-400 light:text-slate-500 truncate">
                15m and 5m alignments unlock richer correlation badges and deeper chains.
              </span>
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 inline-flex items-center gap-1 shrink-0">
            <span>Unlock</span>
            <span className="material-symbols-outlined text-[14px] transition-transform group-hover:translate-x-0.5">
              arrow_forward
            </span>
          </span>
        </button>

        <HowItWorksCollapsible
          body={
            <div className="flex flex-col gap-2">
              <p>
                Each column groups active alignments by depth — 2-deep is a two-TF
                alignment, 4-deep is four timeframes firing the same pattern in the same
                direction. Deeper chains are rarer and typically more durable.
              </p>
              <p>
                The amber ⏱ on a card means the deepest TF is breathing — the alignment
                is still holding past its fresh window, but a direction flip or a third
                stale candle will trigger a demote.
              </p>
            </div>
          }
        />
      </div>

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} blocking={false} />
    </div>
  );
};
