import type { Time } from 'lightweight-charts';

const STYLE_ID = 'lw-tv-chart-label-styles';

/** App candle green / red (matches InteractiveLiveChart markers). */
const BULL_BG = '#13ec37';
const BEAR_BG = '#ff4444';
const NEUTRAL_BG = 'rgba(100,116,139,0.95)';
const ACCENT_BG = '#eab308';

export type TvLabelVariant = 'bull' | 'bear' | 'neutral' | 'accent';

export interface TvLabelItem {
  time: Time;
  price: number;
  text: string;
  variant: TvLabelVariant;
  /**
   * 'up' = box below anchor, tail points up (LW belowBar).
   * 'down' = box above anchor, tail points down (LW aboveBar).
   */
  pointer: 'up' | 'down';
}

export type LwTvChartApi = {
  timeScale(): {
    timeToCoordinate(time: Time): number | null;
    subscribeVisibleLogicalRangeChange(
      handler: (range: { from: number; to: number } | null) => void,
    ): void;
    unsubscribeVisibleLogicalRangeChange(
      handler: (range: { from: number; to: number } | null) => void,
    ): void;
  };
};

export type LwTvPriceSeriesApi = {
  priceToCoordinate(price: number): number | null;
  setMarkers(markers: unknown[]): void;
};

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .lw-tv-labels-root{position:absolute;inset:0;pointer-events:none;z-index:7;overflow:visible;}
    .lw-tv-label{
      position:absolute;left:0;top:0;padding:3px 7px;border-radius:3px;
      font-size:10px;font-weight:700;color:#fff;white-space:nowrap;line-height:1.2;
      pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,0.35);
      max-width:220px;overflow:hidden;text-overflow:ellipsis;
    }
    .lw-tv-label-bull{background:${BULL_BG};}
    .lw-tv-label-bear{background:${BEAR_BG};}
    .lw-tv-label-neutral{background:${NEUTRAL_BG};color:#f8fafc;}
    .lw-tv-label-accent{background:${ACCENT_BG};color:#1a1a1a;}
    .lw-tv-label-ptr-down{transform:translate(-50%,calc(-100% - 6px));}
    .lw-tv-label-ptr-up{transform:translate(-50%,6px);}
    .lw-tv-label-ptr-down.lw-tv-label-bull::after,.lw-tv-label-ptr-down.lw-tv-label-bear::after,.lw-tv-label-ptr-down.lw-tv-label-neutral::after,.lw-tv-label-ptr-down.lw-tv-label-accent::after{
      content:'';position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);
      border-left:5px solid transparent;border-right:5px solid transparent;
    }
    .lw-tv-label-ptr-down.lw-tv-label-bull::after{border-top:5px solid ${BULL_BG};}
    .lw-tv-label-ptr-down.lw-tv-label-bear::after{border-top:5px solid ${BEAR_BG};}
    .lw-tv-label-ptr-down.lw-tv-label-neutral::after{border-top:5px solid ${NEUTRAL_BG};}
    .lw-tv-label-ptr-down.lw-tv-label-accent::after{border-top:5px solid ${ACCENT_BG};}
    .lw-tv-label-ptr-up.lw-tv-label-bull::before,.lw-tv-label-ptr-up.lw-tv-label-bear::before,.lw-tv-label-ptr-up.lw-tv-label-neutral::before,.lw-tv-label-ptr-up.lw-tv-label-accent::before{
      content:'';position:absolute;top:-5px;left:50%;transform:translateX(-50%);
      border-left:5px solid transparent;border-right:5px solid transparent;
    }
    .lw-tv-label-ptr-up.lw-tv-label-bull::before{border-bottom:5px solid ${BULL_BG};}
    .lw-tv-label-ptr-up.lw-tv-label-bear::before{border-bottom:5px solid ${BEAR_BG};}
    .lw-tv-label-ptr-up.lw-tv-label-neutral::before{border-bottom:5px solid ${NEUTRAL_BG};}
    .lw-tv-label-ptr-up.lw-tv-label-accent::before{border-bottom:5px solid ${ACCENT_BG};}
  `;
  document.head.appendChild(style);
}

function variantClass(v: TvLabelVariant): string {
  switch (v) {
    case 'bear':
      return 'lw-tv-label-bear';
    case 'neutral':
      return 'lw-tv-label-neutral';
    case 'accent':
      return 'lw-tv-label-accent';
    default:
      return 'lw-tv-label-bull';
  }
}

function layoutLabels(
  chart: LwTvChartApi,
  series: LwTvPriceSeriesApi,
  elements: { el: HTMLDivElement; time: Time; price: number }[],
) {
  const ts = chart.timeScale();
  for (const { el, time, price } of elements) {
    const x = ts.timeToCoordinate(time);
    const y = series.priceToCoordinate(price);
    if (x == null || y == null) {
      el.style.visibility = 'hidden';
      continue;
    }
    el.style.visibility = 'visible';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }
}

/**
 * TradingView-style HTML labels on the chart container. Clears LW native markers on the series.
 * z-index 7 so labels sit above CISD HTML layer (6) when both exist on different code paths.
 */
export function mountTvChartLabels(
  overlayHost: HTMLElement,
  chart: LwTvChartApi,
  priceSeries: LwTvPriceSeriesApi,
  items: TvLabelItem[],
): () => void {
  ensureStyles();

  const cs = getComputedStyle(overlayHost);
  if (cs.position === 'static') {
    overlayHost.style.position = 'relative';
  }

  const root = document.createElement('div');
  root.className = 'lw-tv-labels-root';
  overlayHost.appendChild(root);

  const entries: { el: HTMLDivElement; time: Time; price: number }[] = [];

  for (const item of items) {
    const el = document.createElement('div');
    el.className = `lw-tv-label ${variantClass(item.variant)} lw-tv-label-ptr-${item.pointer === 'down' ? 'down' : 'up'}`;
    el.textContent = item.text;
    root.appendChild(el);
    entries.push({ el, time: item.time, price: item.price });
  }

  try {
    priceSeries.setMarkers([]);
  } catch {
    /* ignore */
  }

  const runLayout = () => layoutLabels(chart, priceSeries, entries);

  const onRange = () => {
    requestAnimationFrame(runLayout);
  };

  chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

  let resizeObs: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObs = new ResizeObserver(onRange);
    resizeObs.observe(overlayHost);
  }

  requestAnimationFrame(runLayout);

  return () => {
    try {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
    } catch {
      /* ignore */
    }
    resizeObs?.disconnect();
    root.remove();
  };
}
