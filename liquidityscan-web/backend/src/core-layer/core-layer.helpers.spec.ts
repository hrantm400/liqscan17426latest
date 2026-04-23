import {
    Tf,
    TF_CANDLE_MS,
} from './core-layer.constants';
import {
    classifyAnchor,
    computeLifeState,
    computePlusSummary,
    findCorrelationPairs,
    inferSePatternKind,
    isTfExpired,
    normalizeDirection,
    pruneTemporallyIncoherent,
    shouldShowDirectionWarning,
    sortChain,
} from './core-layer.helpers';

/**
 * Core-Layer helpers — pure unit tests. These lock the backend-vs-frontend
 * contract: the frontend has an identically-named test suite in Phase 1 and
 * any divergence between these two sets of assertions is a bug (ADR D10).
 */
describe('core-layer helpers', () => {
    describe('sortChain', () => {
        it('puts higher-timeframe first and is stable', () => {
            expect(sortChain(['1H', '4H', 'W', '1D'])).toEqual(['W', '1D', '4H', '1H']);
            expect(sortChain(['W', '1D', '4H', '1H'])).toEqual(['W', '1D', '4H', '1H']);
            expect(sortChain([])).toEqual([]);
            expect(sortChain(['1H'])).toEqual(['1H']);
        });
    });

    describe('classifyAnchor', () => {
        it('returns WEEKLY when W is paired with any lower TF', () => {
            expect(classifyAnchor(['W', '1D'])).toBe('WEEKLY');
            expect(classifyAnchor(['W', '1H'])).toBe('WEEKLY');
            expect(classifyAnchor(['W', '1D', '4H', '1H'])).toBe('WEEKLY');
        });
        it('returns DAILY when 1D is paired with any lower TF (no W)', () => {
            expect(classifyAnchor(['1D', '4H'])).toBe('DAILY');
            expect(classifyAnchor(['1D', '1H'])).toBe('DAILY');
            expect(classifyAnchor(['1D', '4H', '1H'])).toBe('DAILY');
        });
        it('returns FOURHOUR when 4H is paired with a lower TF (no W, no 1D)', () => {
            expect(classifyAnchor(['4H', '1H'])).toBe('FOURHOUR');
        });
        it('returns null when the chain has no valid anchor', () => {
            expect(classifyAnchor(['1H'])).toBeNull();
            expect(classifyAnchor(['W'])).toBeNull();
            expect(classifyAnchor(['1D'])).toBeNull();
            expect(classifyAnchor(['4H'])).toBeNull();
            expect(classifyAnchor([])).toBeNull();
        });
    });

    describe('findCorrelationPairs', () => {
        it('returns only pairs where both TFs are present', () => {
            expect(findCorrelationPairs(['1D', '1H'])).toEqual([['1D', '1H']]);
            expect(findCorrelationPairs(['W', '1D', '4H', '1H'])).toEqual([['1D', '1H']]);
            expect(findCorrelationPairs(['4H', '1H'])).toEqual([]);
            expect(findCorrelationPairs(['1D', '4H'])).toEqual([]);
        });
    });

    describe('computeLifeState', () => {
        // Use 4H as the TF so candleMs = 4h (14_400_000 ms). Any `now` close to the candle-
        // close boundary can be expressed as "N candles + offset" for readability.
        const tf: Tf = '4H';
        const candleMs = TF_CANDLE_MS[tf];
        const closeAt = 1_000_000_000_000;

        it('returns fresh when dt < 1 candle', () => {
            expect(computeLifeState(tf, closeAt, closeAt + 1)).toBe('fresh');
            expect(computeLifeState(tf, closeAt, closeAt + candleMs - 1)).toBe('fresh');
        });

        it('returns breathing for the 2-candle window per ADR D13', () => {
            expect(computeLifeState(tf, closeAt, closeAt + candleMs)).toBe('breathing');
            expect(computeLifeState(tf, closeAt, closeAt + 2 * candleMs - 1)).toBe('breathing');
            expect(computeLifeState(tf, closeAt, closeAt + 2 * candleMs)).toBe('breathing');
            expect(computeLifeState(tf, closeAt, closeAt + 3 * candleMs - 1)).toBe('breathing');
        });

        it('returns steady once dt >= 3 candles', () => {
            expect(computeLifeState(tf, closeAt, closeAt + 3 * candleMs)).toBe('steady');
            expect(computeLifeState(tf, closeAt, closeAt + 10 * candleMs)).toBe('steady');
        });

        it('computes literal life state for W and 1D — the HTF→steady override is applied at the API boundary, not here', () => {
            const wClose = 1_000_000_000_000;
            expect(computeLifeState('W', wClose, wClose + 1)).toBe('fresh');
            expect(computeLifeState('1D', wClose, wClose + TF_CANDLE_MS['1D'])).toBe('breathing');
        });
    });

    describe('isTfExpired', () => {
        it('returns true when dt > 3 * candleMs (and false on the boundary)', () => {
            const tf: Tf = '1H';
            const candleMs = TF_CANDLE_MS[tf];
            const closeAt = 2_000_000_000_000;
            expect(isTfExpired(tf, closeAt, closeAt + 3 * candleMs)).toBe(false);
            expect(isTfExpired(tf, closeAt, closeAt + 3 * candleMs + 1)).toBe(true);
        });
    });

    describe('computePlusSummary', () => {
        it('returns "all" when every known TF is a Plus pattern', () => {
            expect(
                computePlusSummary(['W', '1D'], { W: 'REV+', '1D': 'RUN+' }),
            ).toBe('all');
        });
        it('returns "dominant" when >50% of known TFs are Plus', () => {
            expect(
                computePlusSummary(['W', '1D', '4H'], {
                    W: 'REV+',
                    '1D': 'RUN+',
                    '4H': 'REV',
                }),
            ).toBe('dominant');
        });
        it('returns "none" for empty / majority-non-Plus / missing maps', () => {
            expect(computePlusSummary(['W', '1D'], undefined)).toBe('none');
            expect(computePlusSummary([], { W: 'REV+' })).toBe('none');
            expect(
                computePlusSummary(['W', '1D'], { W: 'REV', '1D': 'RUN' }),
            ).toBe('none');
        });
    });

    describe('inferSePatternKind', () => {
        it('maps each of the 8 pattern_v2 strings to the canonical 4-value kind', () => {
            expect(inferSePatternKind('REV_BULLISH')).toBe('REV');
            expect(inferSePatternKind('REV_BEARISH')).toBe('REV');
            expect(inferSePatternKind('REV_PLUS_BULLISH')).toBe('REV+');
            expect(inferSePatternKind('REV_PLUS_BEARISH')).toBe('REV+');
            expect(inferSePatternKind('RUN_BULLISH')).toBe('RUN');
            expect(inferSePatternKind('RUN_BEARISH')).toBe('RUN');
            expect(inferSePatternKind('RUN_PLUS_BULLISH')).toBe('RUN+');
            expect(inferSePatternKind('RUN_PLUS_BEARISH')).toBe('RUN+');
        });
        it('returns null for legacy / missing values', () => {
            expect(inferSePatternKind(null)).toBeNull();
            expect(inferSePatternKind('')).toBeNull();
            expect(inferSePatternKind('UNKNOWN')).toBeNull();
        });
    });

    describe('normalizeDirection', () => {
        it('accepts the frontend vocabulary and upstream scanner vocabulary', () => {
            expect(normalizeDirection('BUY')).toBe('BUY');
            expect(normalizeDirection('buy')).toBe('BUY');
            expect(normalizeDirection('BULL')).toBe('BUY');
            expect(normalizeDirection('BULLISH')).toBe('BUY');
            expect(normalizeDirection('SELL')).toBe('SELL');
            expect(normalizeDirection('BEAR')).toBe('SELL');
            expect(normalizeDirection('BEARISH')).toBe('SELL');
        });
        it('returns null for unknowns', () => {
            expect(normalizeDirection(null)).toBeNull();
            expect(normalizeDirection('')).toBeNull();
            expect(normalizeDirection('NEUTRAL')).toBeNull();
        });
    });

    describe('shouldShowDirectionWarning (variant-aware)', () => {
        const green = { open: 1, close: 2 }; // close > open
        const red = { open: 2, close: 1 };   // close < open
        const doji = { open: 1, close: 1 };  // no body

        it('SE BUY: green candle → no warning, red candle → warning', () => {
            expect(shouldShowDirectionWarning('SE', 'BUY', green)).toBe(false);
            expect(shouldShowDirectionWarning('SE', 'BUY', red)).toBe(true);
        });

        it('SE SELL: red candle → no warning, green candle → warning', () => {
            expect(shouldShowDirectionWarning('SE', 'SELL', red)).toBe(false);
            expect(shouldShowDirectionWarning('SE', 'SELL', green)).toBe(true);
        });

        it('CRT: never warns regardless of direction/color (CRT bodies may close either way)', () => {
            // TACUSDT 1H regression from the §6 diagnostic: green-bodied CRT SELL
            // is a legitimate pattern (wick sweeps prior high, body closes back
            // inside range, prev body > curr body).
            expect(shouldShowDirectionWarning('CRT', 'SELL', green)).toBe(false);
            expect(shouldShowDirectionWarning('CRT', 'BUY', red)).toBe(false);
            expect(shouldShowDirectionWarning('CRT', 'SELL', red)).toBe(false);
            expect(shouldShowDirectionWarning('CRT', 'BUY', green)).toBe(false);
        });

        it('BIAS: never warns regardless of direction/color (fires on candles[i-1] close vs prior range)', () => {
            expect(shouldShowDirectionWarning('BIAS', 'BUY', red)).toBe(false);
            expect(shouldShowDirectionWarning('BIAS', 'SELL', green)).toBe(false);
            expect(shouldShowDirectionWarning('BIAS', 'BUY', green)).toBe(false);
            expect(shouldShowDirectionWarning('BIAS', 'SELL', red)).toBe(false);
        });

        it('SE doji (close === open): no warning either way', () => {
            // Permissive by design: the warning fires only on a strict
            // direction contradiction (SE BUY + close<open, SE SELL +
            // close>open). A doji is ambiguous, not contradictory, so it
            // passes without a ⚠. Edge case — the upstream SE detector
            // shouldn't flag a doji as an engulfing bar anyway, so this
            // path should rarely land in practice.
            expect(shouldShowDirectionWarning('SE', 'BUY', doji)).toBe(false);
            expect(shouldShowDirectionWarning('SE', 'SELL', doji)).toBe(false);
        });
    });

    describe('pruneTemporallyIncoherent (§4 gate)', () => {
        // Monday 2026-04-13 00:00 UTC — weekly candle open for the Apr 13–20 week.
        const W_APR_13 = 1776038400000;
        const W_APR_06 = W_APR_13 - TF_CANDLE_MS.W; // stale W from 2 weeks prior
        const D_APR_21 = W_APR_13 + 8 * TF_CANDLE_MS['1D']; // Apr 21 (Tue after W closed)
        const D_APR_14 = W_APR_13 + TF_CANDLE_MS['1D']; // Apr 14 (inside W candle)
        const H_APR_14_12 = W_APR_13 + TF_CANDLE_MS['1D'] + 12 * TF_CANDLE_MS['1H'];
        const FOUR_H_APR_21 = W_APR_13 + 8 * TF_CANDLE_MS['1D']; // Apr 21 08:00

        function buildBucket(closes: Partial<Record<Tf, number>>) {
            return {
                tfs: new Set<Tf>(Object.keys(closes) as Tf[]),
                tfLastCandleClose: { ...closes },
                sePerTf: {} as Partial<Record<Tf, ReturnType<typeof inferSePatternKind>>>,
            };
        }

        it('keeps a fully-coherent chain intact (MEWUSDT-like: W Apr13 + 1D Apr21)', () => {
            const bucket = buildBucket({ W: W_APR_13, '1D': D_APR_21 });
            pruneTemporallyIncoherent(bucket);
            expect(Array.from(bucket.tfs).sort()).toEqual(['1D', 'W']);
            expect(bucket.tfLastCandleClose.W).toBe(W_APR_13);
            expect(bucket.tfLastCandleClose['1D']).toBe(D_APR_21);
        });

        it('drops stale HTF (PTBUSDT-like: W Apr06 + 1D Apr21 + 4H Apr21 → {1D,4H})', () => {
            const bucket = buildBucket({
                W: W_APR_06,
                '1D': D_APR_21,
                '4H': FOUR_H_APR_21,
            });
            pruneTemporallyIncoherent(bucket);
            expect(Array.from(bucket.tfs).sort()).toEqual(['1D', '4H']);
            expect(bucket.tfLastCandleClose.W).toBeUndefined();
            expect(bucket.tfLastCandleClose['1D']).toBe(D_APR_21);
            expect(bucket.tfLastCandleClose['4H']).toBe(FOUR_H_APR_21);
        });

        it('drops LTF that fired before HTF (stale LTF from prior era)', () => {
            const bucket = buildBucket({
                W: W_APR_13,
                '1D': W_APR_13 - TF_CANDLE_MS['1D'], // Apr 12 — before W candle opened
            });
            pruneTemporallyIncoherent(bucket);
            expect(Array.from(bucket.tfs)).toEqual(['W']);
            expect(bucket.tfLastCandleClose['1D']).toBeUndefined();
        });

        it('accepts LTF inside HTF candle (same-era confirmation)', () => {
            const bucket = buildBucket({
                W: W_APR_13,
                '1D': D_APR_14,
                '1H': H_APR_14_12,
            });
            pruneTemporallyIncoherent(bucket);
            expect(Array.from(bucket.tfs).sort()).toEqual(['1D', '1H', 'W']);
        });

        it('accepts LTF exactly one HTF candle after (grace window)', () => {
            const bucket = buildBucket({
                W: W_APR_13,
                '1D': W_APR_13 + TF_CANDLE_MS.W, // Apr 20 — start of next W candle
            });
            pruneTemporallyIncoherent(bucket);
            expect(Array.from(bucket.tfs).sort()).toEqual(['1D', 'W']);
        });

        it('rejects LTF exactly at factor-2 boundary (2 full HTF candles out)', () => {
            const bucket = buildBucket({
                W: W_APR_13,
                '1D': W_APR_13 + 2 * TF_CANDLE_MS.W, // Apr 27 — two weeks later
            });
            pruneTemporallyIncoherent(bucket);
            // HTF dropped; only 1D survives — caller-side (size < 2) will discard
            expect(Array.from(bucket.tfs)).toEqual(['1D']);
        });

        it('cascades: dropping a stale HTF can re-validate the chain among LTFs', () => {
            // W is stale relative to 4H but not to 1D; after W drops, 1D+4H must still be coherent.
            const bucket = buildBucket({
                W: W_APR_06, // stale
                '1D': D_APR_21,
                '4H': FOUR_H_APR_21,
                '1H': FOUR_H_APR_21 + TF_CANDLE_MS['1H'],
            });
            pruneTemporallyIncoherent(bucket);
            expect(Array.from(bucket.tfs).sort()).toEqual(['1D', '1H', '4H']);
        });

        it('leaves a single-TF bucket alone (caller-side filter will discard)', () => {
            const bucket = buildBucket({ '4H': FOUR_H_APR_21 });
            pruneTemporallyIncoherent(bucket);
            expect(Array.from(bucket.tfs)).toEqual(['4H']);
        });

        it('cleans up sePerTf for dropped TFs', () => {
            const bucket = {
                tfs: new Set<Tf>(['W', '1D']),
                tfLastCandleClose: { W: W_APR_06, '1D': D_APR_21 } as Partial<Record<Tf, number>>,
                sePerTf: { W: 'REV+', '1D': 'REV' } as Partial<Record<Tf, ReturnType<typeof inferSePatternKind>>>,
            };
            pruneTemporallyIncoherent(bucket);
            expect(bucket.sePerTf.W).toBeUndefined();
            expect(bucket.sePerTf['1D']).toBe('REV');
        });
    });
});
