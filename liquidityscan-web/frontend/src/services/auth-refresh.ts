/**
 * Pure refresh helper, isolated from `import.meta.env` so it can be unit
 * tested under ts-jest without Vite's bundler context.
 *
 * The contract: distinguish server-side throttling / unreachable backend
 * (transient — DON'T log the user out) from a genuinely invalid refresh
 * token (expired — DO log the user out). The previous code path treated
 * both identically, which combined with the backend's misconfigured
 * `burst: 5/300s` throttler produced an infinite login loop.
 */

export type RefreshOutcome =
  | { kind: 'ok'; accessToken: string }
  | { kind: 'transient' }
  | { kind: 'expired' };

export const REFRESH_MAX_ATTEMPTS = 4; // initial + 3 retries
export const REFRESH_BACKOFF_MS = [1000, 2000, 4000];
export const REFRESH_RETRY_AFTER_CAP_MS = 8000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface AttemptRefreshOptions {
  /** Override the exponential backoff schedule (in ms). Tests pass tiny values. */
  backoffSchedule?: readonly number[];
  /** Cap for Retry-After-driven delays. Tests pass tiny values. */
  retryAfterCapMs?: number;
  /** Override the network-error pause. Tests pass 0. */
  networkErrorPauseMs?: number;
}

export async function attemptRefresh(
  baseUrl: string,
  opts: AttemptRefreshOptions = {},
): Promise<RefreshOutcome> {
  const backoff = opts.backoffSchedule ?? REFRESH_BACKOFF_MS;
  const retryAfterCap = opts.retryAfterCapMs ?? REFRESH_RETRY_AFTER_CAP_MS;
  const networkErrorPauseMs = opts.networkErrorPauseMs ?? 500;
  let networkRetries = 0;
  for (let attempt = 0; attempt < REFRESH_MAX_ATTEMPTS; attempt++) {
    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // Empty body — backend reads the refresh token from the httpOnly
        // `rt` cookie. Content-Type header is required so Nest's JSON
        // body parser doesn't treat the empty body as malformed.
        body: '{}',
      });
    } catch {
      // Network error → retry once, then transient. NEVER classify a
      // network failure as session expiry — the backend may simply be
      // restarting / unreachable for a few hundred ms.
      networkRetries++;
      if (networkRetries >= 2) return { kind: 'transient' };
      await delay(networkErrorPauseMs);
      continue;
    }
    if (resp.ok) {
      const data = await resp.json().catch(() => null);
      if (data?.accessToken) {
        return { kind: 'ok', accessToken: data.accessToken };
      }
      // 2xx with no token shouldn't happen; treat as expired so the app
      // re-authenticates rather than silently misbehaving.
      return { kind: 'expired' };
    }
    if (resp.status === 429) {
      // Honor Retry-After (in seconds) if present; otherwise exponential
      // backoff. Cap at 8s so a hostile header value can't freeze the UI.
      const ra = resp.headers.get('Retry-After');
      const raSec = ra ? Number(ra) : NaN;
      const backoffMs =
        Number.isFinite(raSec) && raSec > 0
          ? Math.min(raSec * 1000, retryAfterCap)
          : backoff[attempt] ?? 4000;
      if (attempt === REFRESH_MAX_ATTEMPTS - 1) return { kind: 'transient' };
      await delay(backoffMs);
      continue;
    }
    // 401 / 403 / 404 / 5xx → real session loss. Worth a brief note on
    // the 5xx case: an actual server error response (rather than a
    // network failure caught above) is rare enough that 'expired' is the
    // safer choice — we'd rather over-trigger /login than over-retry.
    return { kind: 'expired' };
  }
  return { kind: 'transient' };
}
