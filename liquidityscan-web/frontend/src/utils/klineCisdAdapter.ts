/**
 * klinecharts shim that satisfies the LW-shaped `CisdLwChartApi` and
 * `CisdLwCandleSeriesApi` contracts used by `drawCisdOverlays`. This lets
 * the existing engine-agnostic CISD overlay implementation run unchanged
 * against a klinecharts instance — no modification to drawCisdOverlays.ts
 * required (PR #7 set this up; this adapter completes the chart-level
 * shim that wasn't needed for the HTML-overlay path but IS needed for
 * the MSS / FVG-fallback / retest-band line series.).
 *
 * Shape mapping:
 *
 *   addLineSeries(opts) → returns { setData([{time,value}, …]) }
 *     internally registers a klinecharts `segment` overlay between the
 *     two endpoints. The returned `setData` creates the overlay; the
 *     handle returned to drawCisdOverlays carries the overlay id so
 *     `removeSeries` can clean it up.
 *
 *   removeSeries(handle) → reads the carried overlay id and calls
 *     chart.removeOverlay.
 *
 *   timeScale().timeToCoordinate(time)
 *   timeScale().subscribeVisibleLogicalRangeChange(handler)
 *   timeScale().unsubscribeVisibleLogicalRangeChange(handler)
 *     wrap the kline coord-conversion + action-subscribe APIs in the
 *     LW-shaped surface drawCisdOverlays expects. The coord conversion
 *     is the same logic as `makeKlineGeometryProvider` — kept inline
 *     here so the adapter is a single self-contained module rather than
 *     pulling on a second file at every call site.
 *
 *   seriesApi.priceToCoordinate(price) → kline convertToPixel(.value)
 *   seriesApi.setMarkers([…]) → NO-OP. The LW path uses setMarkers for
 *     the "Retest Zone" extra marker; for klinecharts that role is
 *     already filled by the `cl-signal` overlay registered in
 *     core-layer/kline-extensions, so the LW marker call is harmless to
 *     drop. (drawCisdOverlays already gated its setMarkers call inside
 *     try/catch + a useHtml branch — see lines 537/616 of that file.)
 */
// Time = unix seconds (legacy LW shape, kept as plain number).
type Time = number;
import { ActionType, LineType, type Chart } from 'klinecharts';
import type {
  CisdLwCandleSeriesApi,
  CisdLwChartApi,
} from './drawCisdOverlays';

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
 * Map LW lineStyle integers to klinecharts' style/dashedValue tuple.
 *   0 = solid, 1 = dotted, 2 = dashed.
 * klinecharts has no native "dotted" — we approximate with tight dashes.
 */
function mapLineStyle(
  lineStyle: number | undefined,
): { style: LineType; dashedValue?: number[] } {
  if (lineStyle === 1) return { style: LineType.Dashed, dashedValue: [2, 4] };
  if (lineStyle === 2) return { style: LineType.Dashed, dashedValue: [4, 4] };
  return { style: LineType.Solid };
}

interface KlineSeriesHandle {
  setData(data: { time: Time; value: number }[]): void;
  /** Internal — read by adapter's removeSeries to clean up the overlay. */
  __klineOverlayId(): string | null;
}

function makeChartApi(chart: Chart, paneId: string): CisdLwChartApi {
  return {
    addLineSeries: (opts) => {
      let overlayId: string | null = null;
      const lineStyle = mapLineStyle(opts.lineStyle as number | undefined);
      const handle: KlineSeriesHandle = {
        setData: (data) => {
          if (data.length < 2) return;
          const points = data.map((d) => ({
            timestamp: (d.time as unknown as number) * 1000,
            value: d.value,
          }));
          // `segment` is a klinecharts built-in overlay: line between two
          // arbitrary points. CISD never draws more than two points per
          // logical "line series", so segment is the right primitive even
          // for what LW would have done with N-point setData.
          const id = chart.createOverlay({
            name: 'segment',
            points,
            styles: {
              line: {
                color: (opts.color as string) ?? '#888',
                size: (opts.lineWidth as number) ?? 1,
                style: lineStyle.style,
                ...(lineStyle.dashedValue
                  ? { dashedValue: lineStyle.dashedValue }
                  : {}),
              },
            },
            // Locked: drawCisdOverlays manages line lifecycle itself,
            // we don't want users dragging the MSS / FVG / retest lines.
            lock: true,
          });
          overlayId = typeof id === 'string' ? id : null;
        },
        __klineOverlayId: () => overlayId,
      };
      return handle;
    },
    removeSeries: (s) => {
      const handle = s as KlineSeriesHandle | undefined;
      const id = handle?.__klineOverlayId?.();
      if (id) {
        try {
          chart.removeOverlay(id);
        } catch {
          /* ignore */
        }
      }
    },
    timeScale: () => ({
      timeToCoordinate: (time) => {
        try {
          const sec = time as unknown as number;
          const out = chart.convertToPixel(
            { timestamp: sec * 1000 },
            { paneId },
          );
          return readSingleCoord(out)?.x ?? null;
        } catch {
          return null;
        }
      },
      subscribeVisibleLogicalRangeChange: (handler) => {
        // klinecharts' OnVisibleRangeChange callback signature differs from
        // LW's range param, but drawCisdOverlays only uses the handler as
        // a "rebuild layout" trigger — the param is never read. Pass null
        // through so any defensive code in the callback gets a safe value.
        const wrapped = () => handler(null);
        chart.subscribeAction(ActionType.OnVisibleRangeChange, wrapped);
        // Stash the wrapped reference so a later unsubscribe with the
        // SAME outer handler can find it. Map keyed by the original
        // handler so multiple subscribers don't collide.
        rangeHandlerMap.set(handler, wrapped);
      },
      unsubscribeVisibleLogicalRangeChange: (handler) => {
        const wrapped = rangeHandlerMap.get(handler);
        if (wrapped) {
          try {
            chart.unsubscribeAction(ActionType.OnVisibleRangeChange, wrapped);
          } catch {
            /* ignore */
          }
          rangeHandlerMap.delete(handler);
        }
      },
    }),
  };
}

// Module-level map from "outer handler reference passed by drawCisdOverlays"
// to "wrapped handler we registered with klinecharts". A WeakMap would be
// nicer (functions are GC'd after unmount) but the LW shape uses Function
// type as map key which WeakMap supports — keep WeakMap to avoid retaining
// stale handler refs across chart remounts.
const rangeHandlerMap: WeakMap<
  (range: { from: number; to: number } | null) => void,
  () => void
> = new WeakMap();

function makeSeriesApi(chart: Chart, paneId: string): CisdLwCandleSeriesApi {
  return {
    priceToCoordinate: (price) => {
      try {
        const out = chart.convertToPixel({ value: price }, { paneId });
        return readSingleCoord(out)?.y ?? null;
      } catch {
        return null;
      }
    },
    // No-op. CISD's setMarkers usage is for the "Retest Zone" extra
    // marker, which is rendered via the `cl-signal` overlay system
    // (see InteractiveLiveChart). The legacy LW marker API has no
    // klinecharts equivalent and would just log noise.
    setMarkers: () => undefined,
  };
}

/**
 * Build the chart + series shim pair that drawCisdOverlays expects, backed
 * by a klinecharts instance. Pass both into the existing call site
 * unchanged:
 *
 *   const { chartApi, seriesApi } = makeKlineCisdAdapter(klineChart);
 *   const cleanup = drawCisdOverlays(chartApi, seriesApi, candleBars,
 *     signals, { overlayHost });
 */
export function makeKlineCisdAdapter(
  chart: Chart,
  paneId: string = DEFAULT_PANE_ID,
): { chartApi: CisdLwChartApi; seriesApi: CisdLwCandleSeriesApi } {
  return {
    chartApi: makeChartApi(chart, paneId),
    seriesApi: makeSeriesApi(chart, paneId),
  };
}
