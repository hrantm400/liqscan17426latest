import {
    Controller,
    Get,
    Logger,
    NotFoundException,
    Param,
    Query,
    UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { CoreLayerQueryService } from './core-layer.query.service';
import { ListCoreLayerSignalsQueryDto } from './dto/list-core-layer-signals.query.dto';

/**
 * Core-Layer REST endpoints — Phase 4.
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
 * Auth:
 *   Routes are wrapped with @Public() to match the existing /signals read
 *   endpoints. Backend is authentication-aware but read-only market data
 *   does not gate on user identity. Tier gating (Phase 5) happens on the
 *   frontend via the existing useTierGating hook.
 *
 * Throttling:
 *   Named `default` throttler (120 req/min per IP). Burst is unlikely —
 *   the frontend hits these three routes at most once per page view.
 */
@Controller('core-layer')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60000 } })
export class CoreLayerController {
    private readonly logger = new Logger(CoreLayerController.name);

    constructor(private readonly query: CoreLayerQueryService) {}

    @Public()
    @Get('signals')
    async listSignals(@Query() q: ListCoreLayerSignalsQueryDto) {
        return this.query.listSignals({
            variant: q.variant,
            direction: q.direction,
            anchor: q.anchor,
            status: q.status,
            pair: q.pair,
            cursor: q.cursor,
            limit: q.limit,
        });
    }

    @Public()
    @Get('stats')
    async getStats() {
        return this.query.getStats();
    }

    @Public()
    @Get('signals/:id')
    async getSignalById(@Param('id') id: string) {
        const signal = await this.query.getSignalById(id);
        if (!signal) {
            // Separate from the flag-off empty response: this is a real 404.
            // Flag-off list-endpoint short-circuits before any lookup, so a 404
            // here unambiguously means "flag on but id not found".
            throw new NotFoundException(`Core-Layer signal ${id} not found`);
        }
        return signal;
    }
}
