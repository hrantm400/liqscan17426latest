import {
  findFormingCandleIdx,
  FORMING_CANDLE_STYLE,
} from '../liquidityscan-web/frontend/src/core-layer/chart-forming';

const TF_4H_MS = 4 * 60 * 60 * 1000;

describe('findFormingCandleIdx', () => {
  // Anchor "now" at 2026-04-23 12:07 UTC — matches the SXTUSDT 4H diagnostic
  // scenario from PR-2 where signal candle 04:00–08:00 has just closed and the
  // 12:00–16:00 candle is currently forming.
  const now = Date.UTC(2026, 3, 23, 12, 7);

  it('returns -1 for an empty candle array', () => {
    expect(findFormingCandleIdx([], TF_4H_MS, now)).toBe(-1);
  });

  it('returns -1 when the rightmost candle is fully closed (openTime + intervalMs <= now)', () => {
    // 08:00 candle closes at 12:00, which is < now (12:07). All candles closed.
    const candles = [
      { openTime: Date.UTC(2026, 3, 23, 0) },
      { openTime: Date.UTC(2026, 3, 23, 4) },
      { openTime: Date.UTC(2026, 3, 23, 8) },
    ];
    expect(findFormingCandleIdx(candles, TF_4H_MS, now)).toBe(-1);
  });

  it('returns the last index when the rightmost candle is forming', () => {
    // 12:00 candle would close at 16:00 — currently growing at 12:07.
    const candles = [
      { openTime: Date.UTC(2026, 3, 23, 4) },
      { openTime: Date.UTC(2026, 3, 23, 8) },
      { openTime: Date.UTC(2026, 3, 23, 12) },
    ];
    expect(findFormingCandleIdx(candles, TF_4H_MS, now)).toBe(2);
  });

  it('matches the brief diagnostic scenario: raw[last].openTime > signalCandleCloseTime + intervalMs ⇒ forming', () => {
    // SXTUSDT 4H: signal candle 04:00–08:00, signalCandleCloseTime = 08:00.
    // Last candle openTime = 12:00. signalCandleCloseTime + intervalMs = 12:00.
    // Use a 12:00 forming candle which satisfies forming detection at now=12:07.
    const signalCandleCloseTime = Date.UTC(2026, 3, 23, 8);
    const candles = [
      { openTime: Date.UTC(2026, 3, 23, 4) }, // signal candle
      { openTime: Date.UTC(2026, 3, 23, 8) }, // post-signal closed candle
      { openTime: Date.UTC(2026, 3, 23, 12) }, // forming candle
    ];
    const lastOpen = candles[candles.length - 1].openTime as number;
    expect(lastOpen).toBeGreaterThanOrEqual(signalCandleCloseTime + TF_4H_MS);
    expect(findFormingCandleIdx(candles, TF_4H_MS, now)).toBe(2);
  });

  it('accepts ISO-string openTime (matches Binance candles API shape)', () => {
    const candles = [
      { openTime: '2026-04-23T08:00:00.000Z' }, // closed
      { openTime: '2026-04-23T12:00:00.000Z' }, // forming
    ];
    expect(findFormingCandleIdx(candles, TF_4H_MS, now)).toBe(1);
  });
});

describe('FORMING_CANDLE_STYLE', () => {
  it('uses muted gray for body, border, and wick — clearly distinct from any closed bar', () => {
    expect(FORMING_CANDLE_STYLE.color).toMatch(/^rgba\(156,163,175,/);
    expect(FORMING_CANDLE_STYLE.borderColor).toMatch(/^rgba\(156,163,175,/);
    expect(FORMING_CANDLE_STYLE.wickColor).toMatch(/^rgba\(156,163,175,/);
  });

  it('keeps body fill very low-alpha (≤0.25) so the bar reads as a placeholder', () => {
    const m = FORMING_CANDLE_STYLE.color.match(/rgba\([^)]+,\s*([\d.]+)\)/);
    expect(m).not.toBeNull();
    const alpha = parseFloat(m![1]);
    expect(alpha).toBeLessThanOrEqual(0.25);
  });
});
