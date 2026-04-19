import { Controller, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserThrottlerGuard } from './throttler/user-throttler.guard';

/**
 * Debug endpoint — PR 3.2 + PR 3.3.
 *
 * POST /api/debug/throw-sentry
 *   - Admin-JWT-guarded (via global JwtAuthGuard + AdminGuard).
 *   - PR 3.3: throttled to 1 call per hour per admin user so an
 *     accidental verification loop can't burn through the Sentry
 *     monthly quota.
 *   - Returns 404 when SENTRY_DSN is unset, so the endpoint does not
 *     expose an always-5xx route in environments where Sentry is
 *     dormant. Once DSN is set in .env this flips to 500 + the error
 *     lands in the Sentry dashboard with all scrubbing applied.
 */
@Controller('debug')
@UseGuards(JwtAuthGuard, AdminGuard, UserThrottlerGuard)
export class DebugController {
  @Post('throw-sentry')
  @Throttle({ default: { limit: 1, ttl: 3600000 } })
  throwTest(): void {
    if (!process.env.SENTRY_DSN) {
      throw new NotFoundException();
    }
    throw new Error('Sentry smoke test — PR 3.2 verification');
  }
}
