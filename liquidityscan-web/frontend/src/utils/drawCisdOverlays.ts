import type { Time } from 'lightweight-charts';
import {
  chartTimeAtOrBefore,
  type CisdGeometryProvider,
  closestIdx,
  type GeometryCandleBar,
  resolveReverseBarIndex,
  timeSec,
} from './cisdOverlayGeometry';

const BULL_COLOR = '#26a69a';
const BEAR_COLOR = '#ef5350';
const FIB_COLOR = 'rgba(38,166,234,0.7)';
const RC_BOX_FILL = 'rgba(120,120,120,0.28)';
const FVG_BULL_FILL = 'rgba(76,175,80,0.38)';
const FVG_BEAR_FILL = 'rgba(239,83,80,0.38)';

const STYLE_ID = 'lw-cisd-overlay-styles';

/** Minimal chart API for overlays + line series. */
export type CisdLwChartApi = {
  addLineSeries(opts: Record<string, unknown>): {
    setData(data: { time: Time; value: number }[]): void;
  };
  removeSeries(series: unknown): void;
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

export type CisdLwCandleSeriesApi = {
  priceToCoordinate(price: number): number | null;
  setMarkers(markers: unknown[]): void;
};

/** CISD chart contexts; legacy `CISD_RETEST-*` ids still get MSS family overlays. */
export function isCisdFamilySignal(signal: {
  strategyType?: string;
  id?: string;
}): boolean {
  const st = signal.strategyType;
  if (st === 'CISD') return true;
  const id = signal.id ?? '';
  return id.startsWith('CISD-') || id.startsWith('CISD_RETEST-');
}

export interface CisdRetestBand {
  upper: number;
  lower: number;
  /** Unix seconds — usually retest signal breakout bar open. */
  startTimeSec: number;
}

export interface CisdOverlayExtraMarker {
  detectedAt: string | Date;
  signalType: 'BUY' | 'SELL';
  text: string;
  /** Optional marker color (e.g. yellow for Retest Zone). */
  color?: string;
}

export interface DrawCisdOverlaysOptions {
  retestBand?: CisdRetestBand | null;
  /** Merged into marker buckets alongside MSS labels. */
  extraMarkers?: CisdOverlayExtraMarker[];
  /** When retestBand is set, add a "Retest Zone" marker on the last bar (default true). */
  retestZoneLabel?: boolean;
  /**
   * Host element passed to `createChart` — required for TV-style HTML labels/boxes.
   * When omitted, falls back to LW `setMarkers` only (legacy).
   */
  overlayHost?: HTMLElement | null;
}

export interface CisdOverlaySignal {
  detectedAt: string | Date;
  signalType: 'BUY' | 'SELL';
  price: number;
  metadata?: Record<string, unknown>;
}

export interface CandleBar {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

function ensureCisdOverlayStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .lw-cisd-overlay-root{position:absolute;inset:0;pointer-events:none;z-index:6;overflow:visible;}
    .lw-cisd-label{
      position:absolute;left:0;top:0;padding:3px 7px;border-radius:3px;
      font-size:10px;font-weight:700;color:#fff;white-space:nowrap;line-height:1.2;
      pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,0.35);
      max-width:200px;overflow:hidden;text-overflow:ellipsis;
    }
    .lw-cisd-label-bull{background:${BULL_COLOR};}
    .lw-cisd-label-bear{background:${BEAR_COLOR};}
    .lw-cisd-label-extra{background:#fdd835;color:#1a1a1a;}
    /* Pine label_up: box above anchor, tail points down */
    .lw-cisd-label-bull{transform:translate(-50%,calc(-100% - 6px));}
    /* Pine label_down: box below anchor, tail points up */
    .lw-cisd-label-bear{transform:translate(-50%,6px);}
    .lw-cisd-label-bull::after{
      content:'';position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);
      border-left:5px solid transparent;border-right:5px solid transparent;
      border-top:5px solid ${BULL_COLOR};
    }
    .lw-cisd-label-bear::after{
      content:'';position:absolute;top:-5px;left:50%;transform:translateX(-50%);
      border-left:5px solid transparent;border-right:5px solid transparent;
      border-bottom:5px solid ${BEAR_COLOR};
    }
    .lw-cisd-label-extra{transform:translate(-50%,calc(-100% - 6px));}
    .lw-cisd-label-extra.lw-cisd-extra-below{transform:translate(-50%,6px);}
    .lw-cisd-box-rc,.lw-cisd-box-fvg{
      position:absolute;left:0;top:0;border-radius:1px;pointer-events:none;
    }
    .lw-cisd-box-rc{border:1px solid rgba(120,120,120,0.35);}
    .lw-cisd-box-fvg{border:1px solid rgba(255,255,255,0.12);}
  `;
  document.head.appendChild(style);
}

function hasFvgMeta(meta: Record<string, unknown>): boolean {
  if (meta.has_fvg === true) return true;
  if (meta.Has_fvg === true) return true;
  return false;
}

function addLine(
  chart: CisdLwChartApi,
  series: unknown[],
  opts: { color: string; width: number; style: number; title?: string },
  data: { time: Time; value: number }[],
) {
  if (data.length < 2) return;
  const t0 = timeSec(data[0].time);
  const t1 = timeSec(data[data.length - 1].time);
  if (t1 <= t0) return;
  for (let i = 1; i < data.length; i++) {
    if (timeSec(data[i].time) <= timeSec(data[i - 1].time)) return;
  }
  const s = chart.addLineSeries({
    color: opts.color,
    lineWidth: opts.width,
    lineStyle: opts.style,
    priceLineVisible: false,
    lastValueVisible: false,
    title: opts.title ?? '',
  });
  s.setData(data);
  series.push(s);
}

function appendRetestBandSeries(
  chart: CisdLwChartApi,
  created: unknown[],
  chartData: CandleBar[],
  band: CisdRetestBand,
) {
  const t0 = chartTimeAtOrBefore(chartData as GeometryCandleBar[], band.startTimeSec) as Time;
  const lastTime = chartData[chartData.length - 1].time;
  if ((t0 as number) > (lastTime as number)) return;
  if (!Number.isFinite(band.upper) || !Number.isFinite(band.lower) || band.upper <= band.lower)
    return;

  const borderColor = 'rgba(255,235,59,0.5)';
  const zoneColor = 'rgba(255,235,59,0.12)';

  addLine(chart, created, { color: borderColor, width: 1, style: 2 }, [
    { time: t0, value: band.upper },
    { time: lastTime, value: band.upper },
  ]);
  addLine(chart, created, { color: borderColor, width: 1, style: 2 }, [
    { time: t0, value: band.lower },
    { time: lastTime, value: band.lower },
  ]);
  const mid = (band.upper + band.lower) / 2;
  addLine(chart, created, { color: zoneColor, width: 1, style: 0 }, [
    { time: t0, value: mid },
    { time: lastTime, value: mid },
  ]);
}

type LayoutEntry =
  | {
      kind: 'label-mss';
      el: HTMLDivElement;
      timeSec: number;
      price: number;
      bullish: boolean;
    }
  | {
      kind: 'label-extra';
      el: HTMLDivElement;
      timeSec: number;
      price: number;
      below: boolean;
    }
  | {
      kind: 'box';
      el: HTMLDivElement;
      t1Sec: number;
      t2Sec: number;
      pHigh: number;
      pLow: number;
    };

/**
 * Lightweight-charts → CisdGeometryProvider adapter. Engine-specific glue is
 * confined to this function; the layout pass below is engine-agnostic.
 */
function makeLwGeometryProvider(
  chart: CisdLwChartApi,
  series: CisdLwCandleSeriesApi,
): CisdGeometryProvider {
  const ts = chart.timeScale();
  return {
    timeToCoordinate: (unixSec) => ts.timeToCoordinate(unixSec as unknown as Time),
    priceToCoordinate: (price) => series.priceToCoordinate(price),
    subscribeRangeChange: (handler) => {
      const wrapped = () => handler();
      ts.subscribeVisibleLogicalRangeChange(wrapped);
      return () => {
        try {
          ts.unsubscribeVisibleLogicalRangeChange(wrapped);
        } catch {
          /* ignore */
        }
      };
    },
  };
}

function layoutOverlays(geom: CisdGeometryProvider, entries: LayoutEntry[]) {
  for (const e of entries) {
    if (e.kind === 'label-mss' || e.kind === 'label-extra') {
      const x = geom.timeToCoordinate(e.timeSec);
      const y = geom.priceToCoordinate(e.price);
      if (x == null || y == null) {
        e.el.style.visibility = 'hidden';
        continue;
      }
      e.el.style.visibility = 'visible';
      e.el.style.left = `${x}px`;
      e.el.style.top = `${y}px`;
      continue;
    }
    const x1 = geom.timeToCoordinate(e.t1Sec);
    const x2 = geom.timeToCoordinate(e.t2Sec);
    const yHi = geom.priceToCoordinate(e.pHigh);
    const yLo = geom.priceToCoordinate(e.pLow);
    if (x1 == null || x2 == null || yHi == null || yLo == null) {
      e.el.style.visibility = 'hidden';
      continue;
    }
    const left = Math.min(x1, x2);
    const width = Math.max(1, Math.abs(x2 - x1));
    const top = Math.min(yHi, yLo);
    const height = Math.max(1, Math.abs(yLo - yHi));
    e.el.style.visibility = 'visible';
    e.el.style.left = `${left}px`;
    e.el.style.top = `${top}px`;
    e.el.style.width = `${width}px`;
    e.el.style.height = `${height}px`;
  }
}

/**
 * Draw CISD overlays for all signals on a Lightweight Charts instance.
 * Returns a cleanup function that removes all created series and HTML overlays.
 */
export function drawCisdOverlays(
  chart: CisdLwChartApi,
  candleSeries: CisdLwCandleSeriesApi,
  chartData: CandleBar[],
  signals: CisdOverlaySignal[],
  options?: DrawCisdOverlaysOptions | null,
): () => void {
  const geo = chartData as GeometryCandleBar[];
  const created: unknown[] = [];
  const retestBand = options?.retestBand ?? undefined;
  const overlayHost = options?.overlayHost ?? null;
  const useHtml = overlayHost != null;

  const extras: CisdOverlayExtraMarker[] = [...(options?.extraMarkers ?? [])];
  if (
    retestBand &&
    options?.retestZoneLabel !== false &&
    chartData.length > 0
  ) {
    const tsec = chartData[chartData.length - 1].time as number;
    extras.push({
      detectedAt: new Date(tsec * 1000).toISOString(),
      signalType: 'BUY',
      text: 'Retest Zone',
      color: '#fdd835',
    });
  }

  if (chartData.length === 0) {
    return () => {};
  }

  if (signals.length === 0 && !retestBand && extras.length === 0) {
    return () => {};
  }

  const markerBuckets = new Map<
    number,
    { labels: string[]; signalType: 'BUY' | 'SELL'; fib50: number | null }
  >();

  const layoutEntries: LayoutEntry[] = [];
  let overlayRoot: HTMLDivElement | null = null;
  let unsubscribeRange: (() => void) | null = null;
  let resizeObs: ResizeObserver | null = null;

  if (useHtml) {
    ensureCisdOverlayStyles();
    const host = overlayHost!;
    const cs = getComputedStyle(host);
    if (cs.position === 'static') {
      host.style.position = 'relative';
    }
    overlayRoot = document.createElement('div');
    overlayRoot.className = 'lw-cisd-overlay-root';
    host.appendChild(overlayRoot);
  }

  for (const sig of signals) {
    const meta = sig.metadata ?? {};
    const isBull = sig.signalType === 'BUY';
    const mssColor = isBull ? BULL_COLOR : BEAR_COLOR;

    const breakoutSec = Math.floor(new Date(sig.detectedAt).getTime() / 1000);
    const breakoutIdx = closestIdx(geo, breakoutSec);
    const breakoutTime = chartData[breakoutIdx].time;

    const mssLevel = Number(meta.mss_level ?? sig.price);
    const fib50 = Number(meta.fib_50);

    const revMs =
      meta.reverse_candle_time != null
        ? Number(meta.reverse_candle_time)
        : meta.reverse_bar_open_time != null
        ? Number(meta.reverse_bar_open_time)
        : NaN;
    const revIdx = resolveReverseBarIndex(
      geo,
      breakoutIdx,
      meta,
      Number.isFinite(revMs) ? revMs : undefined,
    );
    const reverseTime = chartData[revIdx].time;
    const revRightIdx = Math.min(revIdx + 1, chartData.length - 1);
    const reverseRightTime = chartData[revRightIdx].time;

    const canDraw =
      revIdx < breakoutIdx && timeSec(reverseTime) < timeSec(breakoutTime);

    if (Number.isFinite(mssLevel) && canDraw) {
      addLine(chart, created, { color: mssColor, width: 2, style: 0 }, [
        { time: reverseTime, value: mssLevel },
        { time: breakoutTime, value: mssLevel },
      ]);
    }

    if (Number.isFinite(fib50) && canDraw) {
      addLine(chart, created, { color: FIB_COLOR, width: 1, style: 2 }, [
        { time: reverseTime, value: fib50 },
        { time: breakoutTime, value: fib50 },
      ]);
    }

    const hasFvg = hasFvgMeta(meta);
    let fvgHi = Number(meta.fvg_high);
    let fvgLo = Number(meta.fvg_low);
    const fvgStartMs = Number(meta.fvg_start_time);
    if (
      hasFvg &&
      breakoutIdx >= 2 &&
      (!Number.isFinite(fvgHi) || !Number.isFinite(fvgLo) || fvgHi <= fvgLo)
    ) {
      const c0 = chartData[breakoutIdx];
      const c2 = chartData[breakoutIdx - 2];
      if (isBull && c0.low > c2.high) {
        fvgHi = c0.low;
        fvgLo = c2.high;
      } else if (!isBull && c0.high < c2.low) {
        fvgHi = c2.low;
        fvgLo = c0.high;
      }
    }

    if (hasFvg && Number.isFinite(fvgHi) && Number.isFinite(fvgLo) && fvgHi > fvgLo) {
      let fvgStartTime: Time;
      if (Number.isFinite(fvgStartMs)) {
        fvgStartTime = chartTimeAtOrBefore(
          geo,
          Math.floor(fvgStartMs / 1000),
        ) as Time;
      } else {
        fvgStartTime = chartData[Math.max(0, breakoutIdx - 2)].time;
      }

      if (timeSec(fvgStartTime) < timeSec(breakoutTime)) {
        if (useHtml && overlayRoot) {
          const el = document.createElement('div');
          el.className = 'lw-cisd-box-fvg';
          el.style.background = isBull ? FVG_BULL_FILL : FVG_BEAR_FILL;
          el.style.border = isBull
            ? '1px solid rgba(38,166,154,0.45)'
            : '1px solid rgba(239,83,80,0.45)';
          overlayRoot.appendChild(el);
          layoutEntries.push({
            kind: 'box',
            el,
            t1Sec: fvgStartTime as number,
            t2Sec: breakoutTime as number,
            pHigh: fvgHi,
            pLow: fvgLo,
          });
        } else {
          const fillCol = isBull ? FVG_BULL_FILL : FVG_BEAR_FILL;
          addLine(chart, created, { color: fillCol, width: 1, style: 0 }, [
            { time: fvgStartTime, value: fvgHi },
            { time: breakoutTime, value: fvgHi },
          ]);
          addLine(chart, created, { color: fillCol, width: 1, style: 0 }, [
            { time: fvgStartTime, value: fvgLo },
            { time: breakoutTime, value: fvgLo },
          ]);
          addLine(chart, created, { color: mssColor, width: 1, style: 0 }, [
            { time: fvgStartTime, value: fvgHi },
            { time: breakoutTime, value: fvgHi },
          ]);
          addLine(chart, created, { color: mssColor, width: 1, style: 0 }, [
            { time: fvgStartTime, value: fvgLo },
            { time: breakoutTime, value: fvgLo },
          ]);
        }
      }
    }

    const mssType = meta.mss_type;
    let label: string;
    if (typeof meta.mss_label === 'string' && meta.mss_label.trim()) {
      label = meta.mss_label.trim();
    } else if (mssType === 'TRAP_MSS') {
      label = isBull ? 'Bull Trap MSS' : 'Bear Trap MSS';
    } else if (hasFvg) {
      label = 'High Prob MSS';
    } else {
      label = isBull ? 'Bull MSS' : 'Bear MSS';
    }

    const fibForLabel = Number.isFinite(fib50) ? fib50 : null;
    const existing = markerBuckets.get(breakoutIdx);
    if (existing) {
      existing.labels.push(label);
      if (fibForLabel != null) existing.fib50 = fibForLabel;
    } else {
      markerBuckets.set(breakoutIdx, {
        labels: [label],
        signalType: sig.signalType,
        fib50: fibForLabel,
      });
    }
  }

  if (useHtml && overlayRoot) {
    for (const [idx, { labels, signalType, fib50: fibBucket }] of markerBuckets) {
      const text = labels.join(' · ').slice(0, 120);
      const c = chartData[idx];
      const priceY =
        fibBucket != null && Number.isFinite(fibBucket)
          ? fibBucket
          : (c.high + c.low) / 2;

      const bullish = signalType === 'BUY';
      const el = document.createElement('div');
      el.className = bullish
        ? 'lw-cisd-label lw-cisd-label-bull'
        : 'lw-cisd-label lw-cisd-label-bear';
      el.textContent = text;
      overlayRoot.appendChild(el);
      layoutEntries.push({
        kind: 'label-mss',
        el,
        timeSec: chartData[idx].time as number,
        price: priceY,
        bullish,
      });
    }

    for (const em of extras) {
      const sec = Math.floor(new Date(em.detectedAt).getTime() / 1000);
      const idx = closestIdx(geo, sec);
      const c = chartData[idx];
      const priceY = (c.high + c.low) / 2;
      /** LW `belowBar` / `aboveBar`: BUY = marker below bar, SELL = above. */
      const below = em.signalType === 'BUY';
      const el = document.createElement('div');
      el.className = below
        ? 'lw-cisd-label lw-cisd-label-extra lw-cisd-extra-below'
        : 'lw-cisd-label lw-cisd-label-extra';
      if (em.color) {
        el.style.background = em.color;
        el.style.color = '#1a1a1a';
      }
      el.textContent = em.text.slice(0, 64);
      overlayRoot.appendChild(el);
      layoutEntries.push({
        kind: 'label-extra',
        el,
        timeSec: chartData[idx].time as number,
        price: priceY,
        below,
      });
    }

    const geom = makeLwGeometryProvider(chart, candleSeries);
    const runLayout = () => layoutOverlays(geom, layoutEntries);
    const fireLayout = () => requestAnimationFrame(runLayout);
    unsubscribeRange = geom.subscribeRangeChange(fireLayout);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(fireLayout);
      resizeObs.observe(overlayHost!);
    }
    requestAnimationFrame(runLayout);
    try {
      candleSeries.setMarkers([]);
    } catch {
      /* ignore */
    }
  } else {
    const extraMarkerObjs = extras.map((em) => {
      const sec = Math.floor(new Date(em.detectedAt).getTime() / 1000);
      const idx = closestIdx(geo, sec);
      const col =
        em.color ?? (em.signalType === 'BUY' ? BULL_COLOR : BEAR_COLOR);
      return {
        time: chartData[idx].time,
        position:
          em.signalType === 'BUY'
            ? ('belowBar' as const)
            : ('aboveBar' as const),
        color: col,
        shape:
          em.signalType === 'BUY'
            ? ('arrowUp' as const)
            : ('arrowDown' as const),
        text: em.text.slice(0, 64),
        size: 1 as const,
      };
    });

    const bucketMarkers = [...markerBuckets.entries()].map(
      ([idx, { labels, signalType }]) => ({
        time: chartData[idx].time,
        position:
          signalType === 'BUY'
            ? ('belowBar' as const)
            : ('aboveBar' as const),
        color: signalType === 'BUY' ? BULL_COLOR : BEAR_COLOR,
        shape:
          signalType === 'BUY'
            ? ('arrowUp' as const)
            : ('arrowDown' as const),
        text: labels.join(' · ').slice(0, 64),
        size: 1 as const,
      }),
    );

    const allMarkers = [...bucketMarkers, ...extraMarkerObjs].sort(
      (a, b) => (a.time as number) - (b.time as number),
    );

    if (allMarkers.length > 0) {
      try {
        candleSeries.setMarkers(allMarkers);
      } catch {
        /* ignore */
      }
    }
  }

  if (retestBand) {
    appendRetestBandSeries(chart, created, chartData, retestBand);
  }

  return () => {
    if (unsubscribeRange) {
      try {
        unsubscribeRange();
      } catch {
        /* ignore */
      }
    }
    resizeObs?.disconnect();
    overlayRoot?.remove();
    for (const s of created) {
      try {
        chart.removeSeries(s);
      } catch {
        /* ignore */
      }
    }
    if (!useHtml) {
      try {
        candleSeries.setMarkers([]);
      } catch {
        /* ignore */
      }
    }
  };
}
