import type { AnchorType, CoreLayerVariant, TF } from './types';

/**
 * Core-Layer — compile-time constants.
 *
 * Anything that could theoretically be Pro-gated, localized, or ordered lives
 * here so that Phase 7 (sub-hour unlock) becomes a data edit, not a component
 * rewrite. Per ADR D11 the runtime feature flag is a separate concern on the
 * backend — these constants describe the UI-layer's notion of "what exists".
 */

/** Canonical ordering, high-timeframe first. Used by every sort/walk helper. */
export const TF_ORDER: readonly TF[] = ['W', '1D', '4H', '1H', '15m', '5m'];

/**
 * TFs rendered in v1. 15m and 5m exist in the type system but are hidden from
 * `DepthGrid` and `TFStack` until Phase 7 flips the feature flag. Components
 * already support them; iterating this array is the only change required.
 */
export const VISIBLE_TFS: readonly TF[] = ['W', '1D', '4H', '1H'];

/** Sub-hour TFs. Pro-tier only in production (visible in Phase 7). */
export const PRO_TFS: readonly TF[] = ['15m', '5m'];

/**
 * Candle duration in milliseconds for life-state math. A week = 7 days of 24h
 * (no DST adjustment — exchanges stream in UTC).
 */
export const TF_CANDLE_MS: Record<TF, number> = {
  W: 7 * 24 * 60 * 60 * 1000,
  '1D': 24 * 60 * 60 * 1000,
  '4H': 4 * 60 * 60 * 1000,
  '1H': 60 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '5m': 5 * 60 * 1000,
};

/**
 * High-correlation TF pairings. v1 surfaces only `1D + 1H`; the other two are
 * defined here so that the matching helper (`findCorrelationPairs`) and any
 * badge-rendering component don't need edits when Phase 7 unlocks sub-hour.
 */
export const CORRELATION_PAIRS: ReadonlyArray<readonly [TF, TF]> = [
  ['1D', '1H'],
  ['4H', '15m'],
  ['1H', '5m'],
];

/** Anchor metadata used by `AnchorSelectorCards`, `PageHeader`, and URL params. */
export const ANCHOR_META: Record<AnchorType, {
  label: string;
  shortLabel: string;
  emoji: string;
  urlParam: 'weekly' | 'daily' | 'fourhour';
  description: string;
}> = {
  WEEKLY: {
    label: 'Weekly-anchored',
    shortLabel: 'Weekly',
    emoji: '🏛',
    urlParam: 'weekly',
    description: 'W + at least one of 1D / 4H / 1H aligned',
  },
  DAILY: {
    label: 'Daily-anchored',
    shortLabel: 'Daily',
    emoji: '📅',
    urlParam: 'daily',
    description: '1D + at least one of 4H / 1H aligned',
  },
  FOURHOUR: {
    label: '4H-anchored',
    shortLabel: '4H',
    emoji: '⏳',
    urlParam: 'fourhour',
    description: '4H + at least one lower TF aligned',
  },
};

/** URL param → canonical anchor. Used when parsing `?anchor=...`. */
export const ANCHOR_FROM_URL: Record<string, AnchorType> = {
  weekly: 'WEEKLY',
  daily: 'DAILY',
  fourhour: 'FOURHOUR',
};

/** Depth columns rendered by `DepthGrid` in v1. The 5-deep column ships in Phase 7. */
export const DEPTH_COLUMNS: ReadonlyArray<{ depth: number; label: string; blurb: string }> = [
  { depth: 2, label: '2-deep', blurb: 'Two-TF alignment' },
  { depth: 3, label: '3-deep', blurb: 'Three-TF alignment' },
  { depth: 4, label: '4-deep', blurb: 'Four-TF alignment' },
];

/** Variant metadata — matches Appendix A of the implementation plan. */
export const VARIANT_META: Record<CoreLayerVariant, {
  label: string;
  shortLabel: string;
  urlSlug: 'se' | 'crt' | 'bias';
  icon: string;
  tagline: string;
}> = {
  SE: {
    label: 'SE Core-Layer',
    shortLabel: 'SE',
    urlSlug: 'se',
    icon: 'grain',
    tagline: 'SuperEngulfing alignment across timeframes',
  },
  CRT: {
    label: 'CRT Core-Layer',
    shortLabel: 'CRT',
    urlSlug: 'crt',
    icon: 'radar',
    tagline: 'Candle Range Trigger alignment across timeframes',
  },
  BIAS: {
    label: 'Bias Core-Layer',
    shortLabel: 'Bias',
    urlSlug: 'bias',
    icon: 'stacked_line_chart',
    tagline: 'Bias-flip alignment across timeframes',
  },
};

/** URL-slug → canonical variant. Used when parsing `/core-layer/:variant`. */
export const VARIANT_FROM_SLUG: Record<string, CoreLayerVariant> = {
  se: 'SE',
  crt: 'CRT',
  bias: 'BIAS',
};

/** Per-page localStorage keys. Kept together so Phase 2 (IntroVideoPill) can reuse. */
export const LS_KEYS = {
  tier: 'ls.core-layer.tier',
  introSeenOverview: 'ls.core-layer.intro-seen.overview',
  introSeenDeepDive: 'ls.core-layer.intro-seen.deep-dive',
  introSeenPair: 'ls.core-layer.intro-seen.pair',
} as const;

/** Deterministic "now" for Phase 1 mock data. All relative history timestamps use this anchor. */
export const MOCK_NOW = Date.UTC(2026, 3, 21, 12, 0, 0); // 2026-04-21T12:00:00Z
