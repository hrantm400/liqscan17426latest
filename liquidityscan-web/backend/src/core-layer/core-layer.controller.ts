import {
    Controller,
    Get,
    Headers,
    Logger,
    NotFoundException,
    Param,
    Query,
    UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { CoreLayerQueryService } from './core-layer.query.service';
import { CoreLayerTierResolverService } from './core-layer.tier-resolver.service';
import { ListCoreLayerSignalsQueryDto } from './dto/list-core-layer-signals.query.dto';

/**
 * Core-Layer REST endpoints — Phase 4 (+ Phase 7.3 tier gating).
 *
 * Routes:
 *   GET /core-layer/signals        — paginated list, cursor-based.
 *   GET /core-layer/signals/:id    — single signal with full history.
 *   GET /core-layer/stats          — aggregate counts (active rows only).
 *
 * Flag semantics:
 *   When CORE_LAYER_ENABLED=false (default), every endpoint returns an
 *   empty/zeroed response with `enabled: false` so the frontend can show
 *   a "feature disabled" banner without having to distinguish between
 *   server-side disabled and genuinely empty.
 *
 * Auth & tier gating (Phase 7.3):
 *   Routes stay @Public() — anonymous reads continue to work. Where an
 *   `Authorization: Bearer <jwt>` header is present we best-effort decode
 *   it and resolve an effective tier (FULL_ACCESS | SCOUT) via the
 *   CoreLayerTierResolverService. The resolver never throws on a missing
 *   or malformed token; it downgrades to SCOUT. This keeps the endpoint
 *   resilient for both signed-in and anonymous callers while giving the
 *   query service the authoritative signal it needs to strip Pro content
 *   (PRO_TFS and depth ≥ 5) for SCOUT users — see ADR D18.
 *
 * Throttling:
 *   Named `default` throttler (120 req/min per IP). The globally-registered
 *   `burst` (5 req / 5 min) and `strict` (10 req / min) throttlers are
 *   explicitly skipped — they are tuned for write / heavy-compute paths
 *   and would false-positive on a normal page load (overview + variant +
 *   pair detail each fire 2-4 list/stats/detail reads in parallel).
 */
@Controller('core-layer')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ burst: true, strict: true })
@Throttle({ default: { limit: 120, ttl: 60000 } })
export class CoreLayerController {
    private readonly logger = new Logger(CoreLayerController.name);

    constructor(
        private readonly query: CoreLayerQueryService,
        private readonly tierResolver: CoreLayerTierResolverService,
    ) {}

    @Public()
    @Get('signals')
    async listSignals(
        @Query() q: ListCoreLayerSignalsQueryDto,
        @Headers('authorization') authHeader?: string,
    ) {
        const tier = await this.tierResolver.resolveFromAuthHeader(authHeader);
        return this.query.listSignals({
            variant: q.variant,
            direction: q.direction,
            anchor: q.anchor,
            status: q.status,
            pair: q.pair,
            cursor: q.cursor,
            limit: q.limit,
            tier,
        });
    }

    @Public()
    @Get('stats')
    async getStats(@Headers('authorization') authHeader?: string) {
        const tier = await this.tierResolver.resolveFromAuthHeader(authHeader);
        return this.query.getStats(tier);
    }

    @Public()
    @Get('signals/:id')
    async getSignalById(
        @Param('id') id: string,
        @Headers('authorization') authHeader?: string,
    ) {
        const tier = await this.tierResolver.resolveFromAuthHeader(authHeader);
        const signal = await this.query.getSignalById(id, tier);
        if (!signal) {
            // Separate from the flag-off empty response: this is a real 404.
            // Flag-off list-endpoint short-circuits before any lookup, so a
            // 404 here means either "flag on but id not found" or "Pro-tier
            // signal requested by a SCOUT caller" — both correctly opaque
            // to the client.
            throw new NotFoundException(`Core-Layer signal ${id} not found`);
        }
        return signal;
    }
}
