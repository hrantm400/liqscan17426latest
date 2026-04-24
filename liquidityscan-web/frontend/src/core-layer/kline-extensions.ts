/**
 * Shared klinecharts extensions used by every kline-engine chart in the app.
 *
 *  - `registerExtensions()` is idempotent. Both KlineCoreLayerChart (mini
 *    pair-detail tiles) and KlineInteractiveLiveChart (full SignalDetails
 *    chart) call it on mount; the second call is a no-op.
 *
 *  - `makeKlineGeometryProvider(chart)` produces a `CisdGeometryProvider`
 *    so the engine-agnostic `drawCisdOverlays` (PR #7) can position its
 *    HTML overlays against a klinecharts instance, exactly as the LW
 *    adapter `makeLwGeometryProvider` does. This is the bridge that makes
 *    the chart-engine swap possible without touching `drawCisdOverlays`
 *    or `InteractiveLiveChart`.
 *
 *  - `makeKlineLwTvShim(chart)` exposes the same structural shape as
 *    `LwTvChartApi` + `LwTvPriceSeriesApi` from `utils/lwChartTvLabels.ts`,
 *    in case a future caller wants to reuse that helper directly without
 *    a parallel klineTvLabels module. KlineInteractiveLiveChart uses
 *    klineTvLabels for now; the shim is kept for flexibility.
 */
import {
  ActionType,
  IndicatorSeries,
  LineType,
  registerIndicator,
  registerOverlay,
  type Chart,
} from 'klinecharts';
import type { CisdGeometryProvider } from '../utils/cisdOverlayGeometry';
import { calculateRSI } from '../utils/rsiDivergence';

/* ────────────── shared color tokens ────────────── */

const FORMING_FILL = 'rgba(156,163,175,0.18)';
const FORMING_BORDER = 'rgba(156,163,175,0.7)';
const DAY_SEP_COLOR = 'rgba(156,163,175,0.35)';

const RSI_LINE_COLOR = '#eab308'; // gold/yellow — TradingView convention
const RSI_LEVEL_30_COLOR = 'rgba(34,197,94,0.4)';
const RSI_LEVEL_50_COLOR = 'rgba(156,163,175,0.3)';
const RSI_LEVEL_70_COLOR = 'rgba(239,68,68,0.4)';
// Default color when extendData.color is unset on a cl-rsi-divergence
// overlay. Bull green is the safer default — bear color is always passed
// explicitly from the component when divResult.type === 'bearish'.
const RSI_BULL_DIV_COLOR = '#089981';

/* ────────────── one-time overlay registration ────────────── */

let extensionsRegistered = false;

/**
 * Register every klinecharts overlay the app uses. Idempotent — safe to call
 * multiple times (only the first call does work). klinecharts' overlay
 * registry is module-global, so we don't want to re-register on every chart
 * mount.
 */
export function registerExtensions(): void {
  if (extensionsRegistered) return;
  extensionsRegistered = true;

  // Forming-candle tint: translucent rect over the in-progress bar's column.
  // Implemented as an overlay (not an indicator) so it doesn't merge into
  // the candle pane's y-axis auto-scale — see PR #16 for the indicator-vs-
  // overlay trap that broke y-axis scaling on the first PoC iteration.
  registerOverlay({
    name: 'cl-forming',
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    lock: true,
    createPointFigures: ({ coordinates, bounding, barSpace }) => {
      const c = coordinates[0];
      if (!c) return [];
      const colWidth = barSpace?.gapBar ?? 10;
      return [
        {
          type: 'rect',
          attrs: {
            x: c.x - colWidth / 2,
            y: 0,
            width: colWidth,
            height: bounding.height,
          },
          styles: {
            style: 'fill',
            color: FORMING_FILL,
            borderColor: FORMING_BORDER,
            borderSize: 1,
          },
        },
      ];
    },
  });

  // Day separator: dashed vertical line at one timestamp. Sub-daily TFs only
  // (caller is responsible for not creating instances on W/1D — same
  // convention as the LW chart's SVG day-separator overlay).
  registerOverlay({
    name: 'cl-dayline',
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    lock: true,
    createPointFigures: ({ coordinates, bounding }) => {
      const c = coordinates[0];
      if (!c) return [];
      return [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: c.x, y: 0 },
              { x: c.x, y: bounding.height },
            ],
          },
          styles: {
            style: 'dashed',
            dashedValue: [3, 3],
            size: 1,
            color: DAY_SEP_COLOR,
          },
        },
      ];
    },
  });

  // Wilder RSI 14, drawn in its own pane. The 30/50/70 horizontal levels
  // are painted via the indicator's `draw` callback (canvas API, full
  // control). Indicator has no candle-pane scale-merge concern because
  // its data domain (0-100) belongs to its OWN pane (createIndicator(...,
  // false, ...) creates a new pane). Compare with PR #16's forming-tint
  // bug which stacked an indicator on the candle pane.
  registerIndicator<{ rsi: number }>({
    name: 'WILDER_RSI',
    shortName: 'RSI 14',
    series: IndicatorSeries.Normal,
    precision: 2,
    // 20-80 zoom matches the LW chart's visible y-range. The 30/50/70
    // levels stay inside this window, and the actual RSI line clips
    // gracefully when it extends to extremes (which is rare for RSI 14
    // and rarer still mid-screen — most divergences live in the 25-75
    // zone where this zoom is exactly right).
    minValue: 20,
    maxValue: 80,
    figures: [
      {
        key: 'rsi',
        title: 'RSI: ',
        type: 'line',
        // Style: just color + size; the figure `type: 'line'` already
        // implies a solid stroke. klinecharts' IndicatorFigureStyle
        // narrows the optional `style` field to enum-mapped strings via
        // a generic that doesn't accept LineType directly — easier to
        // omit it than to fight the typing.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        styles: ((): any => ({
          color: RSI_LINE_COLOR,
          size: 2,
        })),
      },
    ],
    calc: (dataList) => {
      const closes = dataList.map((d) => d.close);
      const rsi = calculateRSI(closes, 14);
      return rsi.map((v) => ({ rsi: Number.isFinite(v) ? v : NaN }));
    },
    draw: ({ ctx, bounding, yAxis }) => {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      const levels: Array<{ value: number; color: string }> = [
        { value: 30, color: RSI_LEVEL_30_COLOR },
        { value: 50, color: RSI_LEVEL_50_COLOR },
        { value: 70, color: RSI_LEVEL_70_COLOR },
      ];
      for (const { value, color } of levels) {
        const y = yAxis.convertToPixel(value);
        if (!Number.isFinite(y)) continue;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(bounding.width, y);
        ctx.stroke();
      }
      ctx.restore();
      // Returning false lets klinecharts render the default RSI line
      // figure on top of the level lines we just drew.
      return false;
    },
  });

  // RSI divergence trend line + endpoint circles + endpoint text labels.
  // Used twice per divergence detection: once on the RSI pane (anchored
  // to RSI values), once on the candle pane (anchored to price values).
  // Same overlay, different paneId, different anchor values.
  //
  // extendData carries:
  //   color    — line + circle + text fill (#089981 bull / #F23645 bear)
  //   labelA   — text below/above point A (default 'Pivot 1')
  //   labelB   — text below/above point B (default 'Pivot 2')
  //   pointer  — 'up' or 'down'; controls which side of the circle the
  //              text label sits on. Match LW's belowBar (bull) /
  //              aboveBar (bear) convention.
  registerOverlay({
    name: 'cl-rsi-divergence',
    totalStep: 3,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    lock: true,
    createPointFigures: ({ coordinates, overlay }) => {
      const a = coordinates[0];
      const b = coordinates[1];
      if (!a || !b) return [];
      const ext = (overlay.extendData ?? {}) as {
        color?: string;
        labelA?: string;
        labelB?: string;
        pointer?: 'up' | 'down';
      };
      const color = ext.color ?? RSI_BULL_DIV_COLOR;
      const labelA = ext.labelA ?? 'Pivot 1';
      const labelB = ext.labelB ?? 'Pivot 2';
      const pointer = ext.pointer ?? 'up';
      // pointer 'up' = labels sit BELOW circles (bullish — pivots are at
      // lows). pointer 'down' = ABOVE (bearish — pivots are at highs).
      const labelDy = pointer === 'up' ? 14 : -10;
      const labelBaseline = pointer === 'up' ? 'top' : 'bottom';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const figs: any[] = [
        {
          type: 'line',
          attrs: { coordinates: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }] },
          styles: { color, size: 3, style: LineType.Solid },
        },
        {
          type: 'circle',
          attrs: { x: a.x, y: a.y, r: 5 },
          styles: { style: 'fill', color },
        },
        {
          type: 'circle',
          attrs: { x: b.x, y: b.y, r: 5 },
          styles: { style: 'fill', color },
        },
        {
          type: 'text',
          attrs: {
            x: a.x,
            y: a.y + labelDy,
            text: labelA,
            align: 'center',
            baseline: labelBaseline,
          },
          styles: { color, size: 11, weight: 'bold' },
        },
        {
          type: 'text',
          attrs: {
            x: b.x,
            y: b.y + labelDy,
            text: labelB,
            align: 'center',
            baseline: labelBaseline,
          },
          styles: { color, size: 11, weight: 'bold' },
        },
      ];
      return figs;
    },
  });

  // Signal arrow with optional text. Triangle at the bar's high/low,
  // colored by life-state (or warn-orange when the variant-aware direction
  // check fires). Used by both the mini Core-Layer tile and the full
  // SignalDetails kline chart.
  registerOverlay({
    name: 'cl-signal',
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    lock: true,
    createPointFigures: ({ coordinates, overlay }) => {
      const c = coordinates[0];
      if (!c) return [];
      const ext = (overlay.extendData ?? {}) as {
        dir?: 'up' | 'down';
        color?: string;
        text?: string;
        size?: 'sm' | 'md';
      };
      const dir = ext.dir ?? 'up';
      const color = ext.color ?? '#13ec37';
      const text = ext.text ?? '';
      // Bigger arrow for the full chart (`size: 'md'`); default small for
      // mini tiles. The two surfaces have very different visual scale.
      const isMd = ext.size === 'md';
      const tipMag = isMd ? 14 : 10;
      const baseMag = isMd ? 24 : 18;
      const wingX = isMd ? 8 : 6;
      const tipOff = dir === 'up' ? tipMag : -tipMag;
      const baseOff = dir === 'up' ? baseMag : -baseMag;
      const apex = { x: c.x, y: c.y + tipOff };
      const left = { x: c.x - wingX, y: c.y + baseOff };
      const right = { x: c.x + wingX, y: c.y + baseOff };
      // klinecharts' OverlayCreateFiguresCallback return type is too narrow
      // for our union of polygon + text figures; the runtime accepts both.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const figs: any[] = [
        {
          type: 'polygon',
          attrs: { coordinates: [apex, left, right] },
          styles: { style: 'fill', color },
        },
      ];
      if (text) {
        figs.push({
          type: 'text',
          attrs: {
            x: c.x,
            y: c.y + (dir === 'up' ? baseOff + 12 : baseOff - 4),
            text,
            align: 'center',
            baseline: dir === 'up' ? 'top' : 'bottom',
          },
          styles: { color, size: isMd ? 12 : 10, weight: 'bold' },
        });
      }
      return figs;
    },
  });
}

/* ────────────── geometry adapter for drawCisdOverlays ────────────── */

const DEFAULT_PANE_ID = 'candle_pane';

interface PartialCoord {
  x?: number | null;
  y?: number | null;
}

function readSingleCoord(out: unknown): PartialCoord | null {
  if (!out) return null;
  if (Array.isArray(out)) return (out[0] ?? null) as PartialCoord | null;
  return out as PartialCoord;
}

/**
 * Build a `CisdGeometryProvider` backed by a klinecharts instance.
 *
 * Mirrors the contract of `makeLwGeometryProvider` in
 * `utils/drawCisdOverlays.ts`: time→x, price→y, range subscription. The
 * abstraction was introduced in PR #7 specifically so the CISD overlay
 * code wouldn't need to know whether it's running against
 * lightweight-charts or klinecharts.
 *
 * Caveats observed in the feasibility report:
 *   - `convertToPixel` returns a Partial<Coordinate>; either coord may be
 *     null if the pane has no measured size yet (first paint cycle, before
 *     the ResizeObserver fires).
 *   - `paneId` is required to get pane-local coords; without it we'd get
 *     null y values.
 *   - `subscribeAction(OnVisibleRangeChange)` returns void (no
 *     unsubscribe handle), so we keep the wrapped handler in closure and
 *     re-pass it to `unsubscribeAction`.
 */
export function makeKlineGeometryProvider(
  chart: Chart,
  paneId: string = DEFAULT_PANE_ID,
): CisdGeometryProvider {
  return {
    timeToCoordinate: (unixSec) => {
      try {
        const out = chart.convertToPixel(
          { timestamp: unixSec * 1000 },
          { paneId },
        );
        const c = readSingleCoord(out);
        return c?.x ?? null;
      } catch {
        return null;
      }
    },
    priceToCoordinate: (price) => {
      try {
        const out = chart.convertToPixel({ value: price }, { paneId });
        const c = readSingleCoord(out);
        return c?.y ?? null;
      } catch {
        return null;
      }
    },
    subscribeRangeChange: (handler) => {
      const wrapped = () => handler();
      chart.subscribeAction(ActionType.OnVisibleRangeChange, wrapped);
      return () => {
        try {
          chart.unsubscribeAction(ActionType.OnVisibleRangeChange, wrapped);
        } catch {
          /* ignore */
        }
      };
    },
  };
}
