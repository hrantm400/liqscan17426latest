import { getApiBaseUrl, getStoredAccessToken } from './userApi';
import { Signal, StrategyType } from '../types';

function authHeaders(json = false): Record<string, string> {
  const token = getStoredAccessToken();
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

/**
 * Fetch signals from backend GET /api/signals.
 * Currently only Super Engulfing is stored via webhook; other strategies return [].
 */
export async function fetchSignals(strategyType?: StrategyType, limit = 1000, minVolume?: number): Promise<Signal[]> {
  try {
    const baseUrl = getApiBaseUrl();
    const params = new URLSearchParams();
    if (strategyType) params.set('strategyType', strategyType);
    if (limit) params.set('limit', limit.toString());
    if (minVolume) params.set('minVolume', minVolume.toString());
    const url = `${baseUrl}/signals${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Merges scanner RSIDIVERGENCE rows with legacy RSI_DIVERGENCE (dedupe by id). */
export async function fetchRsiDivergenceSignalsUnion(limit = 1000, minVolume?: number): Promise<Signal[]> {
  const [modern, legacy] = await Promise.all([
    fetchSignals('RSIDIVERGENCE', limit, minVolume),
    fetchSignals('RSI_DIVERGENCE', limit, minVolume),
  ]);
  const byId = new Map<string, Signal>();
  for (const s of modern) byId.set(s.id, s);
  for (const s of legacy) {
    if (!byId.has(s.id)) byId.set(s.id, s);
  }
  return Array.from(byId.values());
}

/**
 * Fetch a single signal by its ID from GET /api/signals/:id.
 */
export async function fetchSignalById(id: string): Promise<Signal | null> {
  try {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/signals/${id}`, { headers: authHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as Signal;
  } catch {
    return null;
  }
}

/**
 * Fetch live ICT bias for all symbols in the given timeframe.
 * Returns { [symbol]: { bias, prevHigh, prevLow, direction } }
 */
export type LiveBiasEntry = {
  bias: string;
  prevHigh: number;
  prevLow: number;
  direction: string;
};

async function fetchLiveBias(
  timeframe: string,
): Promise<Record<string, LiveBiasEntry>> {
  try {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/signals/live-bias?timeframe=${encodeURIComponent(timeframe)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return {};
    return (await res.json()) as Record<string, LiveBiasEntry>;
  } catch {
    return {};
  }
}

/** Parallel live bias for ICT Bias monitor — merge with rows using signal.timeframe + symbol. */
export async function fetchLiveBiasForTimeframes(
  timeframes: string[],
): Promise<Record<string, Record<string, LiveBiasEntry>>> {
  const unique = [...new Set(timeframes.map((tf) => tf.toLowerCase()))];
  const results = await Promise.all(unique.map((tf) => fetchLiveBias(tf)));
  const out: Record<string, Record<string, LiveBiasEntry>> = {};
  unique.forEach((tf, i) => {
    out[tf] = results[i] ?? {};
  });
  return out;
}

/**
 * Signal statistics from backend lifecycle tracking.
 */
export interface SignalStats {
  total: number;
  active: number;
  won: number;
  lost: number;
  expired: number;
  winRate: number;
  avgWinPnl: number;
  avgLossPnl: number;
  live: number;
  closedSignals: number;
  archived: number;
}

/**
 * Fetch aggregated signal statistics.
 */
export async function fetchSignalStats(strategyType?: string): Promise<SignalStats> {
  try {
    const baseUrl = getApiBaseUrl();
    const params = new URLSearchParams();
    if (strategyType) params.set('strategyType', strategyType);
    const url = `${baseUrl}/signals/stats${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) return { total: 0, active: 0, won: 0, lost: 0, expired: 0, winRate: 0, avgWinPnl: 0, avgLossPnl: 0, live: 0, closedSignals: 0, archived: 0 };
    return (await res.json()) as SignalStats;
  } catch {
    return { total: 0, active: 0, won: 0, lost: 0, expired: 0, winRate: 0, avgWinPnl: 0, avgLossPnl: 0, live: 0, closedSignals: 0, archived: 0 };
  }
}

/**
 * Fetch ICT bias for specific recent candles.
 */
export async function detectICTBias(candles: any[]): Promise<{ bias: string; message: string } | null> {
  try {
    const token = getStoredAccessToken();
    if (!token) return null;
    const baseUrl = getApiBaseUrl();
    const headers = authHeaders(true);
    const res = await fetch(`${baseUrl}/signals/ict-bias`, {
      method: 'POST',
      headers,
      body: JSON.stringify(candles),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}


// ============================================================
// Daily Recap & Market Overview
// ============================================================

export interface DailyRecapData {
  date: string;
  totalSignals: number;
  signalsByStrategy: Record<string, number>;
  winLossStats: { wins: number; losses: number; winRate: number };
  topSignals: Signal[];
  targetAchievements: {
    tp1: { count: number; percentage: number };
    tp2: { count: number; percentage: number };
    tp3: { count: number; percentage: number };
  };
}

export interface MarketOverviewData {
  topSymbols: { symbol: string; signalCount: number; priceChange: number; trend: 'bullish' | 'bearish' | 'ranging' }[];
  marketTrends: { bullish: number; bearish: number; ranging: number };
  volatility: { symbol: string; volatility: number; priceChange: number }[];
  notableMovements: { symbol: string; priceChange: number; volume: number }[];
}
