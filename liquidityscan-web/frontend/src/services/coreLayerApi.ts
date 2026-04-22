import { getApiBaseUrl, getStoredAccessToken } from './userApi';
import type {
  CoreLayerSignal,
  CoreLayerStatus,
  CoreLayerVariant,
  AnchorType,
  Direction,
} from '../core-layer/types';

/**
 * Core-Layer API client — Phase 5.
 *
 * Thin wrapper over the three backend endpoints shipped in Phase 4:
 *   GET /core-layer/signals         → list (paginated, filters)
 *   GET /core-layer/signals/:id     → single signal with full history
 *   GET /core-layer/stats           → aggregate counts
 *
 * Network errors are caught and collapsed into `{ enabled: false }`-style
 * responses so the UI's fallback-to-mock branch handles them identically
 * to the backend flag being off. That keeps the three Core-Layer pages
 * robust when the backend is down, unreachable, or mid-deploy.
 *
 * The backend DTO matches `CoreLayerSignal` line-for-line (see
 * backend/src/core-layer/dto/core-layer-signal.dto.ts — ADR D10), so the
 * mapper is a near-identity. Future drift should be caught here.
 */

export interface CoreLayerListResponse {
  signals: CoreLayerSignal[];
  nextCursor: string | null;
  enabled: boolean;
}

export interface CoreLayerStatsResponse {
  total: number;
  byVariant: Record<CoreLayerVariant, number>;
  byAnchor: Record<AnchorType, number>;
  byDepth: Record<string, number>;
  enabled: boolean;
}

export interface CoreLayerListFilters {
  variant?: CoreLayerVariant;
  direction?: Direction;
  anchor?: AnchorType;
  status?: CoreLayerStatus;
  pair?: string;
  cursor?: string;
  limit?: number;
}

function authHeaders(): Record<string, string> {
  const token = getStoredAccessToken();
  const h: Record<string, string> = {};
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

const EMPTY_STATS: CoreLayerStatsResponse = {
  total: 0,
  byVariant: { SE: 0, CRT: 0, BIAS: 0 },
  byAnchor: { WEEKLY: 0, DAILY: 0, FOURHOUR: 0 },
  byDepth: {},
  enabled: false,
};

const EMPTY_LIST: CoreLayerListResponse = {
  signals: [],
  nextCursor: null,
  enabled: false,
};

function buildQuery(filters: CoreLayerListFilters): string {
  const params = new URLSearchParams();
  if (filters.variant) params.set('variant', filters.variant);
  if (filters.direction) params.set('direction', filters.direction);
  if (filters.anchor) params.set('anchor', filters.anchor);
  if (filters.status) params.set('status', filters.status);
  if (filters.pair) params.set('pair', filters.pair);
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (typeof filters.limit === 'number') params.set('limit', String(filters.limit));
  const s = params.toString();
  return s ? `?${s}` : '';
}

export async function fetchCoreLayerSignals(
  filters: CoreLayerListFilters = {},
): Promise<CoreLayerListResponse> {
  try {
    const url = `${getApiBaseUrl()}/core-layer/signals${buildQuery(filters)}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) return EMPTY_LIST;
    const data = (await res.json()) as CoreLayerListResponse;
    return normalizeListResponse(data);
  } catch {
    return EMPTY_LIST;
  }
}

export async function fetchCoreLayerSignalById(id: string): Promise<CoreLayerSignal | null> {
  try {
    const url = `${getApiBaseUrl()}/core-layer/signals/${encodeURIComponent(id)}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as CoreLayerSignal;
  } catch {
    return null;
  }
}

export async function fetchCoreLayerStats(): Promise<CoreLayerStatsResponse> {
  try {
    const url = `${getApiBaseUrl()}/core-layer/stats`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) return EMPTY_STATS;
    const data = (await res.json()) as Partial<CoreLayerStatsResponse>;
    return {
      total: typeof data.total === 'number' ? data.total : 0,
      byVariant: {
        SE: data.byVariant?.SE ?? 0,
        CRT: data.byVariant?.CRT ?? 0,
        BIAS: data.byVariant?.BIAS ?? 0,
      },
      byAnchor: {
        WEEKLY: data.byAnchor?.WEEKLY ?? 0,
        DAILY: data.byAnchor?.DAILY ?? 0,
        FOURHOUR: data.byAnchor?.FOURHOUR ?? 0,
      },
      byDepth: data.byDepth ?? {},
      enabled: Boolean(data.enabled),
    };
  } catch {
    return EMPTY_STATS;
  }
}

function normalizeListResponse(raw: CoreLayerListResponse): CoreLayerListResponse {
  return {
    signals: Array.isArray(raw.signals) ? raw.signals : [],
    nextCursor: raw.nextCursor ?? null,
    enabled: Boolean(raw.enabled),
  };
}
