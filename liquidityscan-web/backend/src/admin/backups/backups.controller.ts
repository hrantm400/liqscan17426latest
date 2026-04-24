import { Controller, Get, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../guards/admin.guard';
import { UserThrottlerGuard } from '../../common/throttler/user-throttler.guard';
import { BackupsService } from './backups.service';

/**
 * Admin-only, read-only view over the DB backup directory — PR 3.4.
 *
 * Global JwtAuthGuard runs first (APP_GUARD), then AdminGuard checks
 * ADMIN_EMAILS + User.isAdmin, then UserThrottlerGuard buckets by userId.
 * No restore endpoint — restore is runbook-only (see
 * liquidityscan-web/backend/docs/BACKUPS.md).
 */
@Controller('admin/backups')
@UseGuards(AdminGuard, UserThrottlerGuard)
// Skip the global `burst: 5/300s`. Both routes are admin polling targets
// (the health endpoint especially) — neither needs burst-class abuse
// protection. Per-route `default` limits below stay as the meaningful
// guard. See PR 3 audit for the broader misconfig context.
@SkipThrottle({ burst: true })
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async list() {
    return this.backups.listRecent(20);
  }

  @Get('health')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async health() {
    return this.backups.freshness();
  }
}
