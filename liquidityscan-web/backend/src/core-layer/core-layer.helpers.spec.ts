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
});
