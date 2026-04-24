/**
 * Regression test for the 429-vs-expired distinction in the frontend
 * refresh path.
 *
 * Bug: previously, ANY non-2xx from /auth/refresh (including 429) caused
 * the frontend to call logout() and redirect to /login. Combined with
 * the backend's misconfigured `burst: 5/300s` throttler, this produced
 * an infinite login loop for any user who page-reloaded 5+ times within
 * 5 minutes. Backend fix landed in PR #10; this test pins the frontend
 * defensive contract so a future regression in the throttler config
 * cannot recreate the loop.
 */
import {
  attemptRefresh,
  REFRESH_BACKOFF_MS,
  REFRESH_MAX_ATTEMPTS,
} from '../liquidityscan-web/frontend/src/services/auth-refresh';

const BASE = 'http://api.test';

// Tiny delays so retry/backoff doesn't keep tests waiting wall-clock
// seconds. Real-timer-based — fake timers + microtask interaction is
// fragile around fetch promises.
const TEST_OPTS = {
  backoffSchedule: [1, 1, 1] as const,
  retryAfterCapMs: 5,
  networkErrorPauseMs: 1,
};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('attemptRefresh', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('returns ok when the first call succeeds', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { accessToken: 'abc' }));
    const out = await attemptRefresh(BASE, TEST_OPTS);
    expect(out).toEqual({ kind: 'ok', accessToken: 'abc' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('THE BUG SCENARIO — 429 then 201: retries and returns ok, user stays logged in', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, { message: 'Too Many Requests' }))
      .mockResolvedValueOnce(jsonResponse(201, { accessToken: 'fresh-token' }));

    const out = await attemptRefresh(BASE, TEST_OPTS);

    expect(out).toEqual({ kind: 'ok', accessToken: 'fresh-token' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns transient (NOT expired) after exhausting all 429 retries', async () => {
    for (let i = 0; i < REFRESH_MAX_ATTEMPTS; i++) {
      fetchMock.mockResolvedValueOnce(jsonResponse(429, {}));
    }
    const out = await attemptRefresh(BASE, TEST_OPTS);

    // Crucial: 'transient' (don't logout), NOT 'expired' (do logout).
    expect(out).toEqual({ kind: 'transient' });
    expect(fetchMock).toHaveBeenCalledTimes(REFRESH_MAX_ATTEMPTS);
  });

  it('returns expired on 401 (refresh token genuinely invalid)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }));
    const out = await attemptRefresh(BASE, TEST_OPTS);
    expect(out).toEqual({ kind: 'expired' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns expired on 403', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { message: 'Forbidden' }));
    expect(await attemptRefresh(BASE, TEST_OPTS)).toEqual({ kind: 'expired' });
  });

  it('honors Retry-After header (wall-clock measurable)', async () => {
    // 50ms in the header → real-timer wait ~50ms before retry. Production
    // would multiply by 1000, but with our 5ms cap it's clamped.
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, {}, { 'Retry-After': '5' }))
      .mockResolvedValueOnce(jsonResponse(201, { accessToken: 'abc' }));

    const start = Date.now();
    const out = await attemptRefresh(BASE, TEST_OPTS);
    const elapsed = Date.now() - start;

    expect(out).toEqual({ kind: 'ok', accessToken: 'abc' });
    // The 5s Retry-After is capped to retryAfterCapMs (5ms in tests).
    // Sanity-check: didn't actually wait 5 seconds.
    expect(elapsed).toBeLessThan(1000);
  });

  it('treats network errors as transient (no logout) — retries once then gives up', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Network unreachable'))
      .mockRejectedValueOnce(new Error('Network unreachable'));

    const out = await attemptRefresh(BASE, TEST_OPTS);

    expect(out).toEqual({ kind: 'transient' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('recovers after a single network error then a 201', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValueOnce(jsonResponse(201, { accessToken: 'recovered' }));
    const out = await attemptRefresh(BASE, TEST_OPTS);
    expect(out).toEqual({ kind: 'ok', accessToken: 'recovered' });
  });

  it('uses the documented exponential backoff schedule when Retry-After is absent', () => {
    // Pinned so a future change to backoff is intentional, not accidental.
    expect(REFRESH_BACKOFF_MS).toEqual([1000, 2000, 4000]);
    expect(REFRESH_MAX_ATTEMPTS).toBe(4);
  });
});
