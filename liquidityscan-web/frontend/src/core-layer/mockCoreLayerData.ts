import { MOCK_NOW, TF_CANDLE_MS } from './constants';
import {
  classifyAnchor,
  computeLifeState,
  computePlusSummary,
  findCorrelationPairs,
  sortChain,
} from './helpers';
import type {
  AnchorType,
  CoreLayerHistoryEntry,
  CoreLayerSignal,
  CoreLayerStatus,
  CoreLayerVariant,
  Direction,
  SePatternKind,
  TF,
  TFLifeState,
} from './types';

/**
 * Core-Layer — mock data (Phase 1 only).
 *
 * All timestamps are anchored to `MOCK_NOW` so rendering is deterministic
 * across renders and SSR-safe if ever needed. Per ADR D10 the signal `id` is
 * a deterministic string: `${variant}-${pair}-${initialAnchor}-${detectedAt}`.
 *
 * The factory below enforces invariants from the spec:
 *   - `tfLifeState[tf]` matches `computeLifeState(tf, tfLastCandleClose[tf], MOCK_NOW)`
 *   - `chain` is sorted HTF → LTF
 *   - `depth` equals `chain.length`
 *   - `correlationPairs` is derived, never hand-authored
 *   - `anchor` is re-derived from the chain via `classifyAnchor`
 *   - `plusSummary` (SE only) is computed from `sePerTf`
 *
 * Acceptance targets (spec line 188–200) satisfied below:
 *   - ~40 signals (15 SE + 13 CRT + 12 Bias)
 *   - Anchor split ~14 weekly / 16 daily / 10 fourhour
 *   - Mostly depth 2–3, handful at 4
 *   - Direction ~60/40 buy/sell
 *   - SE Plus: 2 all, 4 dominant, rest none
 *   - ≥4 signals with a fresh TF; ≥5 with a breathing TF; ≥3 of those with
 *     the DEEPEST TF breathing
 *   - ≥2 signals with an `anchor_changed` history entry
 *   - 4 CLOSED signals per variant (12 total)
 */

const HOUR_MS = 60 * 60 * 1000;

interface LifeHint {
  /** TF that should render `fresh`. Only 1H in v1. */
  fresh?: TF;
  /** TF that should render `breathing`. Typically 4H or 1H. */
  breathing?: TF;
  /**
   * Sub-phase of the breathing window (1 = first candle after fresh, 2 =
   * second). Defaults to 1 when omitted. Used by the pair-detail redesign
   * to exercise both the yellow-amber (1/2) and darker-amber (2/2) border
   * tints in the mock UI.
   */
  breathingPhase?: 1 | 2;
}

interface AnchorChange {
  fromAnchor: AnchorType;
  toAnchor: AnchorType;
  hoursAgo: number;
}

interface PromotionHint {
  fromDepth: number;
  hoursAgo: number;
}

interface MockSeed {
  pair: string;
  variant: CoreLayerVariant;
  direction: Direction;
  chain: TF[];
  sePerTf?: Partial<Record<TF, SePatternKind>>;
  life?: LifeHint;
  detectedHoursAgo: number;
  lastPromotedHoursAgo?: number;
  price: number;
  change24h: number;
  status?: CoreLayerStatus;
  closedHoursAgo?: number;
  anchorChange?: AnchorChange;
  promotion?: PromotionHint;
  demotion?: { fromDepth: number; hoursAgo: number; tfRemoved?: TF };
  /** Override the auto-built history with a custom list (rare, for illustrative cases). */
  history?: CoreLayerHistoryEntry[];
}

function buildTfLastCandleClose(chain: TF[], life?: LifeHint): Partial<Record<TF, number>> {
  const out: Partial<Record<TF, number>> = {};
  for (const tf of chain) {
    const candleMs = TF_CANDLE_MS[tf];
    if (tf === 'W' || tf === '1D') {
      // HTF never renders fresh/breathing; anchor to 3 candles ago for stability.
      out[tf] = MOCK_NOW - 3 * candleMs;
      continue;
    }
    if (life?.fresh === tf) {
      // ~30% into the first candle window since close.
      out[tf] = MOCK_NOW - Math.floor(0.3 * candleMs);
    } else if (life?.breathing === tf) {
      // Phase 1: ~30% into the 2nd candle window (1.3·candleMs).
      // Phase 2: ~30% into the 3rd candle window (2.3·candleMs).
      const phase = life.breathingPhase ?? 1;
      out[tf] = MOCK_NOW - Math.floor((phase + 0.3) * candleMs);
    } else {
      // Steady — anchor beyond the 3-candle breathing window.
      out[tf] = MOCK_NOW - 4 * candleMs;
    }
  }
  return out;
}

function buildTfLifeState(
  chain: TF[],
  tfLastCandleClose: Partial<Record<TF, number>>,
): Partial<Record<TF, TFLifeState>> {
  const out: Partial<Record<TF, TFLifeState>> = {};
  for (const tf of chain) {
    const close = tfLastCandleClose[tf];
    if (typeof close === 'number') {
      out[tf] = computeLifeState(tf, close, MOCK_NOW);
    }
  }
  return out;
}

function buildHistory(seed: MockSeed, effectiveAnchor: AnchorType): CoreLayerHistoryEntry[] {
  if (seed.history) return seed.history;
  const entries: CoreLayerHistoryEntry[] = [];

  const originalAnchor = seed.anchorChange?.fromAnchor ?? effectiveAnchor;
  entries.push({
    at: MOCK_NOW - seed.detectedHoursAgo * HOUR_MS,
    event: 'created',
    toDepth: seed.promotion ? seed.promotion.fromDepth : seed.chain.length,
    toAnchor: originalAnchor,
    note: `${seed.variant} chain detected on ${seed.pair}`,
  });

  if (seed.anchorChange) {
    entries.push({
      at: MOCK_NOW - seed.anchorChange.hoursAgo * HOUR_MS,
      event: 'anchor_changed',
      fromAnchor: seed.anchorChange.fromAnchor,
      toAnchor: seed.anchorChange.toAnchor,
      note: `Anchor demoted ${seed.anchorChange.fromAnchor} → ${seed.anchorChange.toAnchor}`,
    });
  }

  if (seed.promotion) {
    entries.push({
      at: MOCK_NOW - seed.promotion.hoursAgo * HOUR_MS,
      event: 'promoted',
      fromDepth: seed.promotion.fromDepth,
      toDepth: seed.chain.length,
      note: `Promoted ${seed.promotion.fromDepth}-deep → ${seed.chain.length}-deep`,
    });
  }

  if (seed.demotion) {
    entries.push({
      at: MOCK_NOW - seed.demotion.hoursAgo * HOUR_MS,
      event: 'demoted',
      fromDepth: seed.demotion.fromDepth,
      toDepth: seed.chain.length,
      tfRemoved: seed.demotion.tfRemoved,
      note: `Demoted ${seed.demotion.fromDepth}-deep → ${seed.chain.length}-deep`,
    });
  }

  if (seed.status === 'CLOSED') {
    const closedAt = MOCK_NOW - (seed.closedHoursAgo ?? 1) * HOUR_MS;
    entries.push({
      at: closedAt,
      event: 'closed',
      note: 'Chain no longer has a valid anchor',
    });
  }

  entries.sort((a, b) => a.at - b.at);
  return entries;
}

function mk(seed: MockSeed): CoreLayerSignal {
  const chain = sortChain(seed.chain);
  const anchor = classifyAnchor(chain);
  if (!anchor) {
    throw new Error(
      `Mock seed for ${seed.pair} (${seed.variant}) has no valid anchor; chain=${JSON.stringify(chain)}`,
    );
  }
  const depth = chain.length;
  const correlationPairs = findCorrelationPairs(chain);
  const tfLastCandleClose = buildTfLastCandleClose(chain, seed.life);
  const tfLifeState = buildTfLifeState(chain, tfLastCandleClose);
  const plusSummary =
    seed.variant === 'SE' && seed.sePerTf ? computePlusSummary(chain, seed.sePerTf) : undefined;

  const detectedAt = MOCK_NOW - seed.detectedHoursAgo * HOUR_MS;
  const lastPromotedAt =
    MOCK_NOW - (seed.lastPromotedHoursAgo ?? seed.detectedHoursAgo) * HOUR_MS;

  const initialAnchor = seed.anchorChange?.fromAnchor ?? anchor;
  const id = `${seed.variant}-${seed.pair}-${initialAnchor}-${detectedAt}`;

  const status: CoreLayerStatus = seed.status ?? 'ACTIVE';
  const closedAt =
    status === 'CLOSED' ? MOCK_NOW - (seed.closedHoursAgo ?? 1) * HOUR_MS : undefined;

  return {
    id,
    pair: seed.pair,
    variant: seed.variant,
    direction: seed.direction,
    anchor,
    chain,
    depth,
    correlationPairs,
    tfLifeState,
    tfLastCandleClose,
    sePerTf: seed.variant === 'SE' ? seed.sePerTf : undefined,
    plusSummary,
    price: seed.price,
    change24h: seed.change24h,
    detectedAt,
    lastPromotedAt,
    status,
    closedAt,
    history: buildHistory(seed, anchor),
  };
}

// -----------------------------------------------------------------------------
// Seeds — hand-authored distribution (see acceptance targets in header comment).
// -----------------------------------------------------------------------------

const SE_SEEDS: MockSeed[] = [
  // WEEKLY anchors (5)
  {
    pair: 'BTCUSDT',
    variant: 'SE',
    direction: 'BUY',
    chain: ['W', '1D', '4H', '1H'],
    sePerTf: { W: 'REV+', '1D': 'REV+', '4H': 'REV+', '1H': 'REV+' },
    life: { breathing: '1H' },
    detectedHoursAgo: 42,
    lastPromotedHoursAgo: 6,
    price: 69420,
    change24h: 2.7,
    promotion: { fromDepth: 3, hoursAgo: 6 },
  },
  {
    pair: 'ETHUSDT',
    variant: 'SE',
    direction: 'BUY',
    chain: ['W', '1D', '1H'],
    sePerTf: { W: 'REV+', '1D': 'REV', '1H': 'REV+' },
    life: { fresh: '1H' },
    detectedHoursAgo: 18,
    price: 3420.15,
    change24h: 1.8,
  },
  {
    pair: 'SOLUSDT',
    variant: 'SE',
    direction: 'BUY',
    chain: ['W', '1D', '4H'],
    sePerTf: { W: 'RUN+', '1D': 'RUN+', '4H': 'RUN+' },
    life: { breathing: '4H', breathingPhase: 2 },
    detectedHoursAgo: 72,
    lastPromotedHoursAgo: 12,
    price: 142.88,
    change24h: 4.1,
    promotion: { fromDepth: 2, hoursAgo: 12 },
  },
  {
    pair: 'BNBUSDT',
    variant: 'SE',
    direction: 'SELL',
    chain: ['W', '4H'],
    sePerTf: { W: 'RUN', '4H': 'RUN' },
    detectedHoursAgo: 90,
    price: 598.22,
    change24h: -1.2,
  },
  {
    pair: 'LINKUSDT',
    variant: 'SE',
    direction: 'BUY',
    chain: ['W', '1D'],
    sePerTf: { W: 'REV', '1D': 'RUN' },
    detectedHoursAgo: 120,
    price: 14.72,
    change24h: 0.6,
  },

  // DAILY anchors (7)
  {
    pair: 'XRPUSDT',
    variant: 'SE',
    direction: 'BUY',
    chain: ['1D', '4H', '1H'],
    sePerTf: { '1D': 'REV+', '4H': 'REV', '1H': 'REV+' },
    life: { breathing: '1H' },
    detectedHoursAgo: 26,
    lastPromotedHoursAgo: 3,
    price: 0.5834,
    change24h: 3.4,
    promotion: { fromDepth: 2, hoursAgo: 3 },
  },
  {
    pair: 'DOGEUSDT',
    variant: 'SE',
    direction: 'BUY',
    chain: ['1D', '1H'],
    sePerTf: { '1D': 'RUN', '1H': 'REV' },
    life: { fresh: '1H' },
    detectedHoursAgo: 14,
    price: 0.132,
    change24h: 5.2,
  },
  {
    pair: 'ADAUSDT',
    variant: 'SE',
    direction: 'SELL',
    chain: ['1D', '4H'],
    sePerTf: { '1D': 'REV', '4H': 'REV' },
    detectedHoursAgo: 48,
    price: 0.4412,
    change24h: -2.1,
  },
  {
    pair: 'AVAXUSDT',
    variant: 'SE',
    direction: 'SELL',
    chain: ['1D', '4H', '1H'],
    sePerTf: { '1D': 'RUN', '4H': 'RUN', '1H': 'RUN' },
    detectedHoursAgo: 30,
    price: 32.41,
    change24h: -0.9,
  },
  {
    pair: 'ATOMUSDT',
    variant: 'SE',
    direction: 'BUY',
    chain: ['1D', '4H'],
    sePerTf: { '1D': 'REV+', '4H': 'REV' },
    detectedHoursAgo: 62,
    price: 8.72,
    change24h: 1.3,
    // Demoted from daily+4h+1h when 1H fell off.
    demotion: { fromDepth: 3, hoursAgo: 4, tfRemoved: '1H' },
  },
  {
    pair: 'NEARUSDT',
    variant: 'SE',
    direction: 'BUY',
    chain: ['1D', '4H', '1H'],
    sePerTf: { '1D': 'REV', '4H': 'RUN', '1H': 'REV' },
    life: { breathing: '4H' },
    detectedHoursAgo: 50,
    lastPromotedHoursAgo: 2,
    price: 5.44,
    change24h: 2.0,
    // Dynamic-anchor demo: WEEKLY → DAILY when W fell off.
    anchorChange: { fromAnchor: 'WEEKLY', toAnchor: 'DAILY', hoursAgo: 6 },
  },
  {
    pair: 'APTUSDT',
    variant: 'SE',
    direction: 'SELL',
    chain: ['1D', '1H'],
    sePerTf: { '1D': 'RUN', '1H': 'REV' },
    detectedHoursAgo: 22,
    price: 11.02,
    change24h: -0.4,
  },

  // FOURHOUR anchors (3)
  {
    pair: 'ARBUSDT',
    variant: 'SE',
    direction: 'BUY',
    chain: ['4H', '1H'],
    sePerTf: { '4H': 'REV', '1H': 'REV+' },
    life: { fresh: '1H' },
    detectedHoursAgo: 10,
    price: 1.42,
    change24h: 2.8,
  },
  {
    pair: 'OPUSDT',
    variant: 'SE',
    direction: 'SELL',
    chain: ['4H', '1H'],
    sePerTf: { '4H': 'RUN', '1H': 'RUN' },
    detectedHoursAgo: 8,
    price: 2.08,
    change24h: -1.7,
  },
  {
    pair: 'SUIUSDT',
    variant: 'SE',
    direction: 'BUY',
    chain: ['4H', '1H'],
    sePerTf: { '4H': 'REV+', '1H': 'REV' },
    detectedHoursAgo: 16,
    price: 0.991,
    change24h: 3.3,
  },

  // CLOSED (4)
  {
    pair: 'DOTUSDT',
    variant: 'SE',
    direction: 'BUY',
    chain: ['1D', '4H'],
    sePerTf: { '1D': 'REV', '4H': 'REV' },
    detectedHoursAgo: 36,
    price: 6.88,
    change24h: 0.2,
    status: 'CLOSED',
    closedHoursAgo: 2,
  },
  {
    pair: 'LTCUSDT',
    variant: 'SE',
    direction: 'SELL',
    chain: ['1D', '4H', '1H'],
    sePerTf: { '1D': 'RUN', '4H': 'RUN', '1H': 'RUN' },
    detectedHoursAgo: 60,
    price: 78.4,
    change24h: -1.1,
    status: 'CLOSED',
    closedHoursAgo: 8,
  },
  {
    pair: 'PEPEUSDT',
    variant: 'SE',
    direction: 'BUY',
    chain: ['4H', '1H'],
    sePerTf: { '4H': 'REV', '1H': 'REV' },
    detectedHoursAgo: 12,
    price: 0.0000082,
    change24h: 6.2,
    status: 'CLOSED',
    closedHoursAgo: 14,
  },
  {
    pair: 'UNIUSDT',
    variant: 'SE',
    direction: 'SELL',
    chain: ['1D', '1H'],
    sePerTf: { '1D': 'REV+', '1H': 'RUN' },
    detectedHoursAgo: 28,
    price: 7.12,
    change24h: -2.6,
    status: 'CLOSED',
    closedHoursAgo: 20,
  },
];

const CRT_SEEDS: MockSeed[] = [
  // WEEKLY (5)
  {
    pair: 'BTCUSDT',
    variant: 'CRT',
    direction: 'BUY',
    chain: ['W', '1D', '4H', '1H'],
    life: { breathing: '1H' },
    detectedHoursAgo: 38,
    lastPromotedHoursAgo: 5,
    price: 69420,
    change24h: 2.7,
    promotion: { fromDepth: 3, hoursAgo: 5 },
  },
  {
    pair: 'ETHUSDT',
    variant: 'CRT',
    direction: 'SELL',
    chain: ['W', '1D'],
    detectedHoursAgo: 92,
    price: 3420.15,
    change24h: 1.8,
  },
  {
    pair: 'SOLUSDT',
    variant: 'CRT',
    direction: 'BUY',
    chain: ['W', '4H'],
    detectedHoursAgo: 52,
    price: 142.88,
    change24h: 4.1,
  },
  {
    pair: 'MATICUSDT',
    variant: 'CRT',
    direction: 'BUY',
    chain: ['W', '1D', '1H'],
    life: { fresh: '1H' },
    detectedHoursAgo: 70,
    price: 0.52,
    change24h: 1.4,
  },
  {
    pair: 'ATOMUSDT',
    variant: 'CRT',
    direction: 'SELL',
    chain: ['W', '1D'],
    detectedHoursAgo: 104,
    price: 8.72,
    change24h: -0.9,
  },

  // DAILY (5)
  {
    pair: 'XRPUSDT',
    variant: 'CRT',
    direction: 'BUY',
    chain: ['1D', '4H', '1H'],
    life: { breathing: '4H', breathingPhase: 2 },
    detectedHoursAgo: 34,
    lastPromotedHoursAgo: 4,
    price: 0.5834,
    change24h: 3.4,
    promotion: { fromDepth: 2, hoursAgo: 4 },
  },
  {
    pair: 'LINKUSDT',
    variant: 'CRT',
    direction: 'BUY',
    chain: ['1D', '1H'],
    life: { fresh: '1H' },
    detectedHoursAgo: 20,
    price: 14.72,
    change24h: 0.6,
  },
  {
    pair: 'ADAUSDT',
    variant: 'CRT',
    direction: 'SELL',
    chain: ['1D', '4H'],
    detectedHoursAgo: 56,
    price: 0.4412,
    change24h: -2.1,
  },
  {
    pair: 'AVAXUSDT',
    variant: 'CRT',
    direction: 'BUY',
    chain: ['1D', '4H', '1H'],
    detectedHoursAgo: 40,
    price: 32.41,
    change24h: 1.2,
    // Dynamic anchor demo #2: WEEKLY → DAILY
    anchorChange: { fromAnchor: 'WEEKLY', toAnchor: 'DAILY', hoursAgo: 10 },
  },
  {
    pair: 'APTUSDT',
    variant: 'CRT',
    direction: 'SELL',
    chain: ['1D', '4H'],
    detectedHoursAgo: 46,
    price: 11.02,
    change24h: -0.4,
  },

  // FOURHOUR (3)
  {
    pair: 'ARBUSDT',
    variant: 'CRT',
    direction: 'BUY',
    chain: ['4H', '1H'],
    life: { breathing: '1H' },
    detectedHoursAgo: 6,
    price: 1.42,
    change24h: 2.8,
  },
  {
    pair: 'OPUSDT',
    variant: 'CRT',
    direction: 'SELL',
    chain: ['4H', '1H'],
    detectedHoursAgo: 14,
    price: 2.08,
    change24h: -1.7,
  },
  {
    pair: 'NEARUSDT',
    variant: 'CRT',
    direction: 'BUY',
    chain: ['4H', '1H'],
    detectedHoursAgo: 9,
    price: 5.44,
    change24h: 2.0,
  },

  // CLOSED (4)
  {
    pair: 'DOGEUSDT',
    variant: 'CRT',
    direction: 'BUY',
    chain: ['1D', '4H'],
    detectedHoursAgo: 32,
    price: 0.132,
    change24h: 5.2,
    status: 'CLOSED',
    closedHoursAgo: 3,
  },
  {
    pair: 'DOTUSDT',
    variant: 'CRT',
    direction: 'SELL',
    chain: ['W', '1D'],
    detectedHoursAgo: 80,
    price: 6.88,
    change24h: 0.2,
    status: 'CLOSED',
    closedHoursAgo: 11,
  },
  {
    pair: 'LTCUSDT',
    variant: 'CRT',
    direction: 'BUY',
    chain: ['4H', '1H'],
    detectedHoursAgo: 24,
    price: 78.4,
    change24h: -1.1,
    status: 'CLOSED',
    closedHoursAgo: 17,
  },
  {
    pair: 'SUIUSDT',
    variant: 'CRT',
    direction: 'SELL',
    chain: ['1D', '1H'],
    detectedHoursAgo: 19,
    price: 0.991,
    change24h: 3.3,
    status: 'CLOSED',
    closedHoursAgo: 22,
  },
];

const BIAS_SEEDS: MockSeed[] = [
  // WEEKLY (4)
  {
    pair: 'BTCUSDT',
    variant: 'BIAS',
    direction: 'BUY',
    chain: ['W', '1D', '4H'],
    life: { breathing: '4H' },
    detectedHoursAgo: 44,
    lastPromotedHoursAgo: 7,
    price: 69420,
    change24h: 2.7,
    promotion: { fromDepth: 2, hoursAgo: 7 },
  },
  {
    pair: 'ETHUSDT',
    variant: 'BIAS',
    direction: 'BUY',
    chain: ['W', '1D', '1H'],
    life: { fresh: '1H' },
    detectedHoursAgo: 28,
    price: 3420.15,
    change24h: 1.8,
  },
  {
    pair: 'SOLUSDT',
    variant: 'BIAS',
    direction: 'SELL',
    chain: ['W', '1D'],
    detectedHoursAgo: 84,
    price: 142.88,
    change24h: -1.3,
  },
  {
    pair: 'BNBUSDT',
    variant: 'BIAS',
    direction: 'BUY',
    chain: ['W', '4H'],
    detectedHoursAgo: 96,
    price: 598.22,
    change24h: 0.8,
  },

  // DAILY (4)
  {
    pair: 'XRPUSDT',
    variant: 'BIAS',
    direction: 'BUY',
    chain: ['1D', '4H'],
    detectedHoursAgo: 38,
    price: 0.5834,
    change24h: 3.4,
  },
  {
    pair: 'LINKUSDT',
    variant: 'BIAS',
    direction: 'SELL',
    chain: ['1D', '4H', '1H'],
    detectedHoursAgo: 22,
    price: 14.72,
    change24h: -1.4,
  },
  {
    pair: 'DOGEUSDT',
    variant: 'BIAS',
    direction: 'BUY',
    chain: ['1D', '1H'],
    life: { breathing: '1H', breathingPhase: 2 },
    detectedHoursAgo: 54,
    price: 0.132,
    change24h: 5.2,
  },
  {
    pair: 'ADAUSDT',
    variant: 'BIAS',
    direction: 'BUY',
    chain: ['1D', '4H'],
    detectedHoursAgo: 66,
    price: 0.4412,
    change24h: 2.1,
  },

  // FOURHOUR (4)
  {
    pair: 'ARBUSDT',
    variant: 'BIAS',
    direction: 'BUY',
    chain: ['4H', '1H'],
    detectedHoursAgo: 7,
    price: 1.42,
    change24h: 2.8,
  },
  {
    pair: 'OPUSDT',
    variant: 'BIAS',
    direction: 'SELL',
    chain: ['4H', '1H'],
    detectedHoursAgo: 15,
    price: 2.08,
    change24h: -1.7,
  },
  {
    pair: 'NEARUSDT',
    variant: 'BIAS',
    direction: 'BUY',
    chain: ['4H', '1H'],
    detectedHoursAgo: 11,
    price: 5.44,
    change24h: 2.0,
  },
  {
    pair: 'APTUSDT',
    variant: 'BIAS',
    direction: 'SELL',
    chain: ['4H', '1H'],
    detectedHoursAgo: 13,
    price: 11.02,
    change24h: -0.4,
  },

  // CLOSED (4)
  {
    pair: 'SOLUSDT',
    variant: 'BIAS',
    direction: 'BUY',
    chain: ['1D', '4H'],
    detectedHoursAgo: 30,
    price: 142.88,
    change24h: 4.1,
    status: 'CLOSED',
    closedHoursAgo: 4,
  },
  {
    pair: 'DOTUSDT',
    variant: 'BIAS',
    direction: 'SELL',
    chain: ['4H', '1H'],
    detectedHoursAgo: 18,
    price: 6.88,
    change24h: -0.7,
    status: 'CLOSED',
    closedHoursAgo: 9,
  },
  {
    pair: 'AVAXUSDT',
    variant: 'BIAS',
    direction: 'BUY',
    chain: ['1D', '1H'],
    detectedHoursAgo: 26,
    price: 32.41,
    change24h: 1.1,
    status: 'CLOSED',
    closedHoursAgo: 16,
  },
  {
    pair: 'MATICUSDT',
    variant: 'BIAS',
    direction: 'SELL',
    chain: ['W', '1D'],
    detectedHoursAgo: 100,
    price: 0.52,
    change24h: -2.2,
    status: 'CLOSED',
    closedHoursAgo: 21,
  },
];

export const MOCK_CORE_LAYER_SIGNALS: CoreLayerSignal[] = [
  ...SE_SEEDS.map(mk),
  ...CRT_SEEDS.map(mk),
  ...BIAS_SEEDS.map(mk),
];

/** Quick lookup maps for O(1) fetch by id or `(variant, pair)`. */
export const MOCK_SIGNALS_BY_ID: Record<string, CoreLayerSignal> = Object.fromEntries(
  MOCK_CORE_LAYER_SIGNALS.map((s) => [s.id, s]),
);

export function getMockSignalsByVariant(variant: CoreLayerVariant): CoreLayerSignal[] {
  return MOCK_CORE_LAYER_SIGNALS.filter((s) => s.variant === variant);
}

export function getMockSignalByPair(
  variant: CoreLayerVariant,
  pair: string,
): CoreLayerSignal | undefined {
  return MOCK_CORE_LAYER_SIGNALS.find(
    (s) => s.variant === variant && s.pair.toUpperCase() === pair.toUpperCase(),
  );
}

/** Most recent promotion events across all variants, for `RecentPromotions` widget. */
export function getMockRecentPromotions(limit = 5): Array<{
  signal: CoreLayerSignal;
  entry: CoreLayerHistoryEntry;
}> {
  const rows: Array<{ signal: CoreLayerSignal; entry: CoreLayerHistoryEntry }> = [];
  for (const signal of MOCK_CORE_LAYER_SIGNALS) {
    for (const entry of signal.history) {
      if (entry.event === 'promoted') rows.push({ signal, entry });
    }
  }
  rows.sort((a, b) => b.entry.at - a.entry.at);
  return rows.slice(0, limit);
}
