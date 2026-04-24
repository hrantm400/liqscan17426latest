/**
 * Pine-style HTML label mount for klinecharts. Parallel to
 * `lwChartTvLabels.ts` — same visual contract (TvLabelItem variant + pointer
 * direction), klinecharts-native subscribe / coord conversion.
 *
 * Implemented as a separate module rather than a refactor of lwChartTvLabels
 * so we don't risk regressions on the LW path (still in production via
 * InteractiveLiveChart). Once the kline migration completes, lwChartTvLabels
 * can be deleted along with the LW component.
 */
import { ActionType, type Chart } from 'klinecharts';

const STYLE_ID = 'kline-tv-chart-label-styles';

const BULL_BG = '#13ec37';
const BEAR_BG = '#ff4444';
const NEUTRAL_BG = 'rgba(100,116,139,0.95)';
const ACCENT_BG = '#eab308';

export type KlineTvLabelVariant = 'bull' | 'bear' | 'neutral' | 'accent';

export interface KlineTvLabelItem {
  /** Unix seconds — same shape lwChartTvLabels uses for cross-engine parity. */
  timeSec: number;
  price: number;
  text: string;
  variant: KlineTvLabelVariant;
  /**
   * 'up' = box below anchor, tail points up (LW belowBar).
   * 'down' = box above anchor, tail points down (LW aboveBar).
   */
  pointer: 'up' | 'down';
}

const DEFAULT_PANE_ID = 'candle_pane';

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // Class names are kept identical to lw-tv-label-* so any visual QA tooling
  // that targets those selectors keeps working when the engine flag flips.
  // The root ID is kline-specific so the two label roots can coexist briefly
  // during a single-chart engine switch (paranoia — not expected in normal
  // flow but cheap to guard against).
  style.textContent = `
    .kline-tv-labels-root{position:absolute;inset:0;pointer-events:none;z-index:7;overflow:visible;}
    .kline-tv-label{
      position:absolute;left:0;top:0;padding:3px 7px;border-radius:3px;
      font-size:10px;font-weight:700;color:#fff;white-space:nowrap;line-height:1.2;
      pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,0.35);
      max-width:220px;overflow:hidden;text-overflow:ellipsis;
    }
    .kline-tv-label-bull{background:${BULL_BG};}
    .kline-tv-label-bear{background:${BEAR_BG};}
    .kline-tv-label-neutral{background:${NEUTRAL_BG};color:#f8fafc;}
    .kline-tv-label-accent{background:${ACCENT_BG};color:#1a1a1a;}
    .kline-tv-label-ptr-down{transform:translate(-50%,calc(-100% - 6px));}
    .kline-tv-label-ptr-up{transform:translate(-50%,6px);}
    .kline-tv-label-ptr-down.kline-tv-label-bull::after,.kline-tv-label-ptr-down.kline-tv-label-bear::after,.kline-tv-label-ptr-down.kline-tv-label-neutral::after,.kline-tv-label-ptr-down.kline-tv-label-accent::after{
      content:'';position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);
      border-left:5px solid transparent;border-right:5px solid transparent;
    }
    .kline-tv-label-ptr-down.kline-tv-label-bull::after{border-top:5px solid ${BULL_BG};}
    .kline-tv-label-ptr-down.kline-tv-label-bear::after{border-top:5px solid ${BEAR_BG};}
    .kline-tv-label-ptr-down.kline-tv-label-neutral::after{border-top:5px solid ${NEUTRAL_BG};}
    .kline-tv-label-ptr-down.kline-tv-label-accent::after{border-top:5px solid ${ACCENT_BG};}
    .kline-tv-label-ptr-up.kline-tv-label-bull::before,.kline-tv-label-ptr-up.kline-tv-label-bear::before,.kline-tv-label-ptr-up.kline-tv-label-neutral::before,.kline-tv-label-ptr-up.kline-tv-label-accent::before{
      content:'';position:absolute;top:-5px;left:50%;transform:translateX(-50%);
      border-left:5px solid transparent;border-right:5px solid transparent;
    }
    .kline-tv-label-ptr-up.kline-tv-label-bull::before{border-bottom:5px solid ${BULL_BG};}
    .kline-tv-label-ptr-up.kline-tv-label-bear::before{border-bottom:5px solid ${BEAR_BG};}
    .kline-tv-label-ptr-up.kline-tv-label-neutral::before{border-bottom:5px solid ${NEUTRAL_BG};}
    .kline-tv-label-ptr-up.kline-tv-label-accent::before{border-bottom:5px solid ${ACCENT_BG};}
  `;
  document.head.appendChild(style);
}

function variantClass(v: KlineTvLabelVariant): string {
  switch (v) {
    case 'bear':
      return 'kline-tv-label-bear';
    case 'neutral':
      return 'kline-tv-label-neutral';
    case 'accent':
      return 'kline-tv-label-accent';
    default:
      return 'kline-tv-label-bull';
  }
}

interface PartialCoord {
  x?: number | null;
  y?: number | null;
}

function readSingleCoord(out: unknown): PartialCoord | null {
  if (!out) return null;
  if (Array.isArray(out)) return (out[0] ?? null) as PartialCoord | null;
  return out as PartialCoord;
}

function layoutLabels(
  chart: Chart,
  paneId: string,
  entries: { el: HTMLDivElement; timeSec: number; price: number }[],
) {
  for (const { el, timeSec, price } of entries) {
    let x: number | null | undefined = null;
    let y: number | null | undefined = null;
    try {
      const tx = chart.convertToPixel({ timestamp: timeSec * 1000 }, { paneId });
      x = readSingleCoord(tx)?.x ?? null;
      const ty = chart.convertToPixel({ value: price }, { paneId });
      y = readSingleCoord(ty)?.y ?? null;
    } catch {
      x = null;
      y = null;
    }
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
 * Mount Pine-style HTML labels onto the chart's container. Returns a cleanup
 * function — caller must invoke on chart unmount, otherwise the label root
 * leaks (same lesson as the InteractiveLiveChart cleanup bug fixed in PR #9).
 */
export function mountKlineTvLabels(
  overlayHost: HTMLElement,
  chart: Chart,
  items: KlineTvLabelItem[],
  paneId: string = DEFAULT_PANE_ID,
): () => void {
  ensureStyles();

  const cs = getComputedStyle(overlayHost);
  if (cs.position === 'static') {
    overlayHost.style.position = 'relative';
  }

  const root = document.createElement('div');
  root.className = 'kline-tv-labels-root';
  overlayHost.appendChild(root);

  const entries: { el: HTMLDivElement; timeSec: number; price: number }[] = [];
  for (const item of items) {
    const el = document.createElement('div');
    el.className = `kline-tv-label ${variantClass(item.variant)} kline-tv-label-ptr-${item.pointer === 'down' ? 'down' : 'up'}`;
    el.textContent = item.text;
    root.appendChild(el);
    entries.push({ el, timeSec: item.timeSec, price: item.price });
  }

  const runLayout = () => layoutLabels(chart, paneId, entries);
  const fireLayout = () => requestAnimationFrame(runLayout);

  const wrappedAction = () => fireLayout();
  chart.subscribeAction(ActionType.OnVisibleRangeChange, wrappedAction);

  let resizeObs: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObs = new ResizeObserver(fireLayout);
    resizeObs.observe(overlayHost);
  }

  // Initial paint after the chart has had a chance to lay out (first
  // requestAnimationFrame is when convertToPixel starts returning real
  // coords; before that it returns null because the pane has no measured
  // height — same gotcha as the feasibility report's Check 5 caveat).
  fireLayout();

  return () => {
    try {
      chart.unsubscribeAction(ActionType.OnVisibleRangeChange, wrappedAction);
    } catch {
      /* ignore */
    }
    resizeObs?.disconnect();
    root.remove();
  };
}
