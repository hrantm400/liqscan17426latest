import { Controller, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Debug endpoint — PR 3.2.
 *
 * POST /api/debug/throw-sentry
 *   - Admin-JWT-guarded (via global JwtAuthGuard + AdminGuard).
 *   - Returns 404 when SENTRY_DSN is unset, so the endpoint does not
 *     expose an always-5xx route in environments where Sentry is
 *     dormant. Once DSN is set in .env this flips to 500 + the error
 *     lands in the Sentry dashboard with all scrubbing applied.
 *
 * Used once post-DSN-activation to verify end-to-end delivery and
 * scrubbing rules.
 */
@Controller('debug')
@UseGuards(JwtAuthGuard, AdminGuard)
export class DebugController {
  @Post('throw-sentry')
  throwTest(): void {
    if (!process.env.SENTRY_DSN) {
      throw new NotFoundException();
    }
    throw new Error('Sentry smoke test — PR 3.2 verification');
  }
}
