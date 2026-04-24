/**
 * @jest-environment jsdom
 *
 * Regression test for the CISD overlay cleanup path.
 *
 * Bug: when the chart was destroyed (e.g. fullscreen toggle on the
 * SignalDetails page), `drawCisdOverlays`'s cleanup function wasn't being
 * invoked from the React effect-return. The overlay root <div> stayed in
 * the DOM, and the next chart's drawCisdOverlays call appended a SECOND
 * overlay root → duplicate MSS labels.
 *
 * The InteractiveLiveChart fix ensures cleanup is called. This test pins
 * the contract that drawCisdOverlays' returned cleanup fully removes the
 * overlay root + unsubscribes from the chart's visible-range events.
 */
import { drawCisdOverlays } from '../liquidityscan-web/frontend/src/utils/drawCisdOverlays';

interface FakeChart {
  addLineSeries: (opts: Record<string, unknown>) => { setData: (d: unknown) => void };
  removeSeries: (s: unknown) => void;
  timeScale: () => {
    timeToCoordinate: (t: number) => number | null;
    subscribeVisibleLogicalRangeChange: (h: (r: unknown) => void) => void;
    unsubscribeVisibleLogicalRangeChange: (h: (r: unknown) => void) => void;
  };
  __subscribers: Array<(r: unknown) => void>;
}

interface FakeSeries {
  priceToCoordinate: (p: number) => number | null;
  setMarkers: (m: unknown[]) => void;
}

function makeFakeChart(): FakeChart {
  const subs: Array<(r: unknown) => void> = [];
  const chart: FakeChart = {
    addLineSeries: () => ({ setData: () => undefined }),
    removeSeries: () => undefined,
    timeScale: () => ({
      // Return synthetic coords so layoutOverlays runs the visible path.
      timeToCoordinate: (t) => (typeof t === 'number' ? (t % 1000) : 0),
      subscribeVisibleLogicalRangeChange: (h) => {
        subs.push(h);
      },
      unsubscribeVisibleLogicalRangeChange: (h) => {
        const i = subs.indexOf(h);
        if (i >= 0) subs.splice(i, 1);
      },
    }),
    __subscribers: subs,
  };
  return chart;
}

function makeFakeSeries(): FakeSeries {
  return {
    priceToCoordinate: () => 100,
    setMarkers: () => undefined,
  };
}

const SAMPLE_CANDLES = [
  { time: 1700000000, open: 100, high: 110, low: 90, close: 105 },
  { time: 1700000060, open: 105, high: 115, low: 95, close: 110 },
  { time: 1700000120, open: 110, high: 120, low: 100, close: 115 },
];

const SAMPLE_SIGNAL = {
  detectedAt: new Date(1700000060 * 1000).toISOString(),
  signalType: 'BUY' as const,
  price: 110,
  metadata: {
    mss_level: 105,
    fib_50: 107.5,
    mss_label: 'Bull MSS',
    reverse_bar_open_time: 1700000000 * 1000,
    reverse_bar_index: 0,
  },
};

describe('drawCisdOverlays cleanup', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.position = 'relative';
    host.style.width = '800px';
    host.style.height = '400px';
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('mounts an overlay root with at least one MSS label inside it', () => {
    const chart = makeFakeChart();
    const series = makeFakeSeries();
    const cleanup = drawCisdOverlays(
      chart as never,
      series as never,
      SAMPLE_CANDLES as never,
      [SAMPLE_SIGNAL],
      { overlayHost: host },
    );

    expect(host.querySelectorAll('.lw-cisd-overlay-root').length).toBe(1);
    const root = host.querySelector('.lw-cisd-overlay-root') as HTMLElement;
    expect(
      root.querySelectorAll('.lw-cisd-label-bull, .lw-cisd-label-bear').length,
    ).toBeGreaterThanOrEqual(1);

    cleanup();
  });

  it('cleanup removes the overlay root from the DOM (no duplicate labels on remount)', () => {
    const chart = makeFakeChart();
    const series = makeFakeSeries();
    const cleanup = drawCisdOverlays(
      chart as never,
      series as never,
      SAMPLE_CANDLES as never,
      [SAMPLE_SIGNAL],
      { overlayHost: host },
    );

    // Pre-condition.
    expect(host.querySelectorAll('.lw-cisd-overlay-root').length).toBe(1);

    cleanup();

    // The bug we are guarding against: stale overlay root left behind, so a
    // subsequent draw cycle doubles the labels visually.
    expect(host.querySelectorAll('.lw-cisd-overlay-root').length).toBe(0);
    expect(
      host.querySelectorAll('.lw-cisd-label-bull, .lw-cisd-label-bear').length,
    ).toBe(0);
  });

  it('cleanup unsubscribes from the chart visible-range event', () => {
    const chart = makeFakeChart();
    const series = makeFakeSeries();

    expect(chart.__subscribers.length).toBe(0);
    const cleanup = drawCisdOverlays(
      chart as never,
      series as never,
      SAMPLE_CANDLES as never,
      [SAMPLE_SIGNAL],
      { overlayHost: host },
    );
    expect(chart.__subscribers.length).toBe(1);

    cleanup();
    expect(chart.__subscribers.length).toBe(0);
  });

  it('two consecutive draw → cleanup cycles leave the host empty (no accumulation)', () => {
    const chart = makeFakeChart();
    const series = makeFakeSeries();

    const c1 = drawCisdOverlays(
      chart as never,
      series as never,
      SAMPLE_CANDLES as never,
      [SAMPLE_SIGNAL],
      { overlayHost: host },
    );
    c1();

    const c2 = drawCisdOverlays(
      chart as never,
      series as never,
      SAMPLE_CANDLES as never,
      [SAMPLE_SIGNAL],
      { overlayHost: host },
    );
    c2();

    expect(host.querySelectorAll('.lw-cisd-overlay-root').length).toBe(0);
    expect(chart.__subscribers.length).toBe(0);
  });
});
