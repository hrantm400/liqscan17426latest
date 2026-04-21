import {
  CORRELATION_PAIRS,
  PRO_TFS,
  TF_CANDLE_MS,
  TF_ORDER,
} from './constants';
import type {
  AnchorType,
  CoreLayerSignal,
  PlusSummary,
  SePatternKind,
  TF,
  TFLifeState,
} from './types';

/**
 * Core-Layer pure helpers. Shared between mock data (Phase 1) and — when
 * Phase 5 lands — the backend engine. No React, no side effects, no clock
 * access (caller passes `now` explicitly so tests are deterministic).
 */

/**
 * Classify a chain's anchor. Per ADR D9, the anchor is dynamic: the signal
 * keeps flowing down to the next valid HTF if the current anchor TF falls off.
 *
 * Rules (in priority order):
 *   - W + any lower TF              → WEEKLY
 *   - 1D + any of 4H / 1H / 15m / 5m → DAILY
 *   - 4H + any of 1H / 15m / 5m     → FOURHOUR
 *   - otherwise                     → null (signal must close)
 */
export function classifyAnchor(chain: TF[]): AnchorType | null {
  const has = (tf: TF) => chain.includes(tf);
  const hasAnyLower = (...tfs: TF[]) => tfs.some((tf) => has(tf));

  if (has('W') && hasAnyLower('1D', '4H', '1H', '15m', '5m')) return 'WEEKLY';
  if (has('1D') && hasAnyLower('4H', '1H', '15m', '5m')) return 'DAILY';
  if (has('4H') && hasAnyLower('1H', '15m', '5m')) return 'FOURHOUR';
  return null;
}

/**
 * Return the subset of canonical correlation pairs where BOTH TFs are present
 * in the chain. `CORRELATION_PAIRS` carries all three defined pairings; in v1
 * only `1D+1H` can be populated (sub-hour is hidden). The helper needs no
 * feature-flag awareness — it's driven purely by the chain contents.
 */
export function findCorrelationPairs(chain: TF[]): Array<[TF, TF]> {
  return CORRELATION_PAIRS.filter(([a, b]) => chain.includes(a) && chain.includes(b)).map(
    ([a, b]) => [a, b] as [TF, TF],
  );
}

/** True if the chain contains any Pro-gated timeframe (15m / 5m). */
export function chainHasProTf(chain: TF[]): boolean {
  return chain.some((tf) => (PRO_TFS as readonly TF[]).includes(tf));
}

/** A Plus SE pattern ends in `+` (REV+ or RUN+). */
export function isPlusVariant(pattern: SePatternKind): boolean {
  return pattern === 'REV+' || pattern === 'RUN+';
}

/**
 * Aggregate Plus classification for an entire SE chain.
 *   - `all`:      every TF in the chain is a Plus pattern
 *   - `dominant`: >50% of TFs with known patterns are Plus
 *   - `none`:     otherwise
 *
 * Missing `sePerTf` entries are ignored in the denominator so a partial map
 * doesn't misclassify a chain as non-Plus by default.
 */
export function computePlusSummary(
  chain: TF[],
  sePerTf?: Partial<Record<TF, SePatternKind>>,
): PlusSummary {
  if (!sePerTf || chain.length === 0) return 'none';
  const known = chain.map((tf) => sePerTf[tf]).filter((p): p is SePatternKind => Boolean(p));
  if (known.length === 0) return 'none';
  const plusCount = known.filter(isPlusVariant).length;
  if (plusCount === known.length) return 'all';
  if (plusCount * 2 > known.length) return 'dominant';
  return 'none';
}

/**
 * Rightmost (deepest) TF in the chain, per canonical `TF_ORDER`.
 * Returns `undefined` for an empty chain so callers can guard, rather than
 * throwing — some code paths (stale closed signal previews) may legitimately
 * receive a zero-length chain.
 */
export function deepestTf(chain: TF[]): TF | undefined {
  if (chain.length === 0) return undefined;
  let winner = chain[0];
  let winnerIdx = TF_ORDER.indexOf(winner);
  for (let i = 1; i < chain.length; i++) {
    const idx = TF_ORDER.indexOf(chain[i]);
    if (idx > winnerIdx) {
      winner = chain[i];
      winnerIdx = idx;
    }
  }
  return winner;
}

/**
 * Life state for a single TF relative to its last candle close.
 *
 *   - W and 1D: always `steady` (HTF exception, spec line 138)
 *   - 4H / 1H / 15m / 5m:
 *       dt < 1 candle           → fresh
 *       1 candle ≤ dt < 2 candles → breathing
 *       otherwise                 → steady
 *
 * The source of truth is the candle close timestamp, never wall-clock (ADR D14).
 */
export function computeLifeState(tf: TF, tfLastCandleClose: number, now: number): TFLifeState {
  if (tf === 'W' || tf === '1D') return 'steady';
  const candleMs = TF_CANDLE_MS[tf];
  const dt = now - tfLastCandleClose;
  if (dt < candleMs) return 'fresh';
  if (dt < 2 * candleMs) return 'breathing';
  return 'steady';
}

/** Sort a chain into canonical (HTF → LTF) order. */
export function sortChain(chain: TF[]): TF[] {
  return [...chain].sort((a, b) => TF_ORDER.indexOf(a) - TF_ORDER.indexOf(b));
}

/** Select signals visible to a given tier. Base users never see Pro-only chains. */
export function filterSignalsByTier(
  signals: CoreLayerSignal[],
  tier: 'base' | 'pro',
): CoreLayerSignal[] {
  if (tier === 'pro') return signals;
  return signals.filter((s) => !chainHasProTf(s.chain));
}
