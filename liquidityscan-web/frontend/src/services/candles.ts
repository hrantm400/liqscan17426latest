import { getApiBaseUrl, getStoredAccessToken } from './userApi';

/** Candle for chart: openTime as string or Date, OHLCV */
export interface ChartCandle {
  symbol: string;
  timeframe: string;
  openTime: Date | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number | null;
}

/** Normalize raw candle (array or object) to ChartCandle */
function normalizeCandle(
  raw: unknown,
  symbol: string,
  timeframe: string,
  _index: number
): ChartCandle | null {
  if (Array.isArray(raw)) {
    const t = Number(raw[0]);
    const open = Number(raw[1]);
    const high = Number(raw[2]);
    const low = Number(raw[3]);
    const close = Number(raw[4]);
    const volume = Number(raw[5]) || 0;
    if (!Number.isFinite(t) || !Number.isFinite(close)) return null;
    const openTime = t < 1e12 ? new Date(t * 1000) : new Date(t);
    return { symbol, timeframe, openTime, open, high, low, close, volume };
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const t = Number(o.openTime ?? o.open_time ?? o.time ?? o[0]);
    const open = Number(o.open ?? o[1]);
    const high = Number(o.high ?? o[2]);
    const low = Number(o.low ?? o[3]);
    const close = Number(o.close ?? o[4]);
    const volume = Number(o.volume ?? o[5] ?? o.quote_volume) || 0;
    if (!Number.isFinite(t) || !Number.isFinite(close)) return null;
    const openTime = t < 1e12 ? new Date(t * 1000) : new Date(t);
    return { symbol, timeframe, openTime, open, high, low, close, volume };
  }
  return null;
}

/**
 * Fetch candle data for a symbol/interval from backend (Binance klines).
 * Uses GET /api/candles/:symbol/:interval. Returns empty array on error.
 */
export async function fetchCandles(
  symbol: string,
  interval: string,
  limit = 500
): Promise<ChartCandle[]> {
  try {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/candles/${encodeURIComponent(symbol)}/${encodeURIComponent(interval)}?limit=${limit}`;
    const token = getStoredAccessToken();
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const rawList = Array.isArray(data)
      ? data
      : Array.isArray(data?.candles)
        ? data.candles
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.klines)
            ? data.klines
            : [];
    const out: ChartCandle[] = [];
    for (let i = 0; i < rawList.length && out.length < limit; i++) {
      const c = normalizeCandle(rawList[i], symbol, interval, i);
      if (c) out.push(c);
    }
    return out.sort(
      (a, b) => new Date(a.openTime).getTime() - new Date(b.openTime).getTime()
    );
  } catch {
    return [];
  }
}
