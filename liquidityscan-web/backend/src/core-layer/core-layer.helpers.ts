import {
    AnchorType,
    CORRELATION_PAIRS,
    Direction,
    PlusSummary,
    SePatternKind,
    Tf,
    TfLifeState,
    TF_CANDLE_MS,
    TF_ORDER,
} from './core-layer.constants';

/**
 * Core-Layer pure helpers (backend side).
 *
 * Line-for-line mirror of frontend/src/core-layer/helpers.ts. Any drift between
 * the two is a bug per ADR D10 — tests in core-layer.helpers.spec.ts lock the
 * shared contract.
 *
 * No Prisma, no Nest, no clock access. Callers always pass `now` explicitly so
 * unit tests stay deterministic and the hourly scan can use a single "now"
 * snapshot across every chain (per ADR D14 — time source of truth is the
 * scanner, not `Date.now()` scattered through call sites).
 */

/** Sort a chain into canonical HTF → LTF order. */
export function sortChain(chain: Tf[]): Tf[] {
    return [...chain].sort((a, b) => TF_ORDER.indexOf(a) - TF_ORDER.indexOf(b));
}

/**
 * Per ADR D9, the anchor is dynamic: the signal keeps flowing down to the next
 * valid HTF if the current anchor TF falls off. Rules in priority order:
 *   - W + any lower TF              → WEEKLY
 *   - 1D + any of 4H/1H/15m/5m      → DAILY
 *   - 4H + any of 1H/15m/5m         → FOURHOUR
 *   - otherwise                     → null (chain must close)
 */
export function classifyAnchor(chain: Tf[]): AnchorType | null {
    const has = (tf: Tf) => chain.includes(tf);
    const hasAnyLower = (...tfs: Tf[]) => tfs.some((tf) => has(tf));

    if (has('W') && hasAnyLower('1D', '4H', '1H', '15m', '5m')) return 'WEEKLY';
    if (has('1D') && hasAnyLower('4H', '1H', '15m', '5m')) return 'DAILY';
    if (has('4H') && hasAnyLower('1H', '15m', '5m')) return 'FOURHOUR';
    return null;
}

/** Return canonical correlation pairs (both TFs present in the chain). */
export function findCorrelationPairs(chain: Tf[]): Array<[Tf, Tf]> {
    return CORRELATION_PAIRS.filter(([a, b]) => chain.includes(a) && chain.includes(b)).map(
        ([a, b]) => [a, b] as [Tf, Tf],
    );
}

/**
 * Life state for a single TF relative to its last candle close.
 *   - W and 1D: stored literal state is computed normally, but the API boundary
 *     overrides to `steady` per ADR D13. The helper itself has no awareness of
 *     that override — it is applied in the query/controller layer so the DB
 *     remains the source of truth per ADR D14.
 *   - 4H/1H/15m/5m:
 *       dt < 1 candle              → fresh
 *       1 ≤ dt < 3 candles         → breathing
 *       dt ≥ 3 candles             → steady
 */
export function computeLifeState(tf: Tf, tfLastCandleClose: number, now: number): TfLifeState {
    const candleMs = TF_CANDLE_MS[tf];
    const dt = now - tfLastCandleClose;
    if (dt < candleMs) return 'fresh';
    if (dt < 3 * candleMs) return 'breathing';
    return 'steady';
}

/**
 * Close threshold for a single TF in the chain. A TF is considered "fallen off"
 * when dt > 3 * candleMs of that TF (matches ADR — the 3x buffer covers the
 * breathing window + one grace candle).
 */
export function isTfExpired(tf: Tf, tfLastCandleClose: number, now: number): boolean {
    return now - tfLastCandleClose > 3 * TF_CANDLE_MS[tf];
}

/** A Plus SE pattern ends in '+' (REV+ or RUN+). */
export function isPlusVariant(pattern: SePatternKind): boolean {
    return pattern === 'REV+' || pattern === 'RUN+';
}

/**
 * Aggregate Plus classification. Missing TFs in sePerTf are ignored in the
 * denominator so a partial map does not misclassify as non-Plus.
 */
export function computePlusSummary(
    chain: Tf[],
    sePerTf?: Partial<Record<Tf, SePatternKind>>,
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
 * Infer SE pattern-kind from a SuperEngulfingSignal row's `pattern_v2` value,
 * which is one of 8 strings: REV_BULLISH, REV_BEARISH, REV_PLUS_BULLISH,
 * REV_PLUS_BEARISH, RUN_BULLISH, RUN_BEARISH, RUN_PLUS_BULLISH, RUN_PLUS_BEARISH.
 * Returns null if the value does not match the expected shape (legacy rows).
 */
export function inferSePatternKind(patternV2: string | null | undefined): SePatternKind | null {
    if (!patternV2) return null;
    const hasPlus = patternV2.includes('_PLUS_');
    if (patternV2.startsWith('REV_')) return hasPlus ? 'REV+' : 'REV';
    if (patternV2.startsWith('RUN_')) return hasPlus ? 'RUN+' : 'RUN';
    return null;
}

/**
 * Normalize a SuperEngulfingSignal.signalType value to a Core-Layer Direction.
 * The upstream scanners write either "BUY"/"SELL" or "BULLISH"/"BEARISH"
 * depending on the variant — we collapse both into the Core-Layer BUY/SELL
 * vocabulary per ADR D10.
 */
export function normalizeDirection(signalType: string | null | undefined): Direction | null {
    if (!signalType) return null;
    const up = signalType.toUpperCase();
    if (up === 'BUY' || up === 'BULL' || up === 'BULLISH') return 'BUY';
    if (up === 'SELL' || up === 'BEAR' || up === 'BEARISH') return 'SELL';
    return null;
}
