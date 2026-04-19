import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Throttler variant that buckets by authenticated userId when present,
 * falling back to IP for unauthenticated traffic — PR 3.3.
 *
 * Trackers are namespaced with a `user:` / `ip:` prefix so a spoofed IP
 * cannot collide with a genuine userId bucket (and vice versa). The
 * same guard is used on `/payments/*`, `/admin/*`, and
 * `/debug/throw-sentry` — all of which sit behind JwtAuthGuard, so
 * `req.user.userId` is the correct axis for fairness across a shared
 * NAT (office network, carrier-grade NAT). The IP fallback is defensive
 * only: if the guard chain is ever reordered and userId is missing we
 * still enforce a per-IP limit instead of silently becoming a no-op.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = req?.user?.userId;
    if (userId && typeof userId === 'string') {
      return `user:${userId}`;
    }
    const ip = typeof req?.ip === 'string' ? req.ip : 'unknown';
    return `ip:${ip}`;
  }
}
