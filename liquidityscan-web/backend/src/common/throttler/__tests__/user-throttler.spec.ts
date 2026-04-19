/**
 * PR 3.3 — UserThrottlerGuard tracker logic unit tests.
 *
 * We only test the `getTracker` axis choice, not the throttle accounting
 * itself — that is @nestjs/throttler's concern.
 */
import { UserThrottlerGuard } from '../user-throttler.guard';

class TestableGuard extends UserThrottlerGuard {
  public async exposeGetTracker(req: Record<string, any>): Promise<string> {
    return this.getTracker(req);
  }
}

describe('UserThrottlerGuard (PR 3.3 — tracker namespacing)', () => {
  const guard = new TestableGuard(
    undefined as never,
    undefined as never,
    undefined as never,
  );

  it('authenticated request → tracker = "user:<userId>"', async () => {
    const req = { user: { userId: 'u_abc123' }, ip: '10.0.0.1' };
    await expect(guard.exposeGetTracker(req)).resolves.toBe('user:u_abc123');
  });

  it('unauthenticated request → tracker = "ip:<ip>"', async () => {
    const req = { ip: '203.0.113.7' };
    await expect(guard.exposeGetTracker(req)).resolves.toBe('ip:203.0.113.7');
  });

  it('request with malformed user payload → falls back to IP tracker', async () => {
    const req = { user: { userId: null }, ip: '198.51.100.42' };
    await expect(guard.exposeGetTracker(req)).resolves.toBe('ip:198.51.100.42');
  });
});
