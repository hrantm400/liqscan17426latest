import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CoreLayerDetectionService } from './core-layer.detection.service';
import { CoreLayerRuntimeFlagService } from './core-layer.runtime-flag.service';
import type { AnchorType, CoreLayerVariantKey } from './core-layer.constants';
import type {
    CoreLayerAdminForceRescanDto,
    CoreLayerAdminSetEnabledDto,
    CoreLayerAdminSetSubHourEnabledDto,
    CoreLayerAdminStatsDto,
} from './dto/core-layer-admin.dto';

/**
 * Phase 5b — admin-side orchestrator for Core-Layer.
 *
 * All three admin endpoints route through this service so the admin
 * controller stays a thin HTTP wrapper and the business logic can be
 * unit-tested without the full DI graph. The service reaches into
 * three collaborators:
 *
 *   - CoreLayerRuntimeFlagService   — current enabled state + tick
 *                                     telemetry + flag mutation.
 *   - CoreLayerDetectionService     — used by force-rescan to rebuild
 *                                     ACTIVE rows immediately after
 *                                     the wipe, so the admin gets a
 *                                     truthful response body without
 *                                     waiting for the next hourly tick.
 *   - PrismaService                 — only used for the wipe (deleteMany)
 *                                     and the active-count groupBy.
 *
 * Design notes:
 *   - Stats endpoint has no side effects. Safe for the admin UI's
 *     10-second auto-refresh.
 *   - setEnabled returns the previous value so the UI can toast
 *     "flipped from X to Y" without a follow-up GET.
 *   - forceRescan deletes ACTIVE rows only — CLOSED history is
 *     preserved (Phase 5b toggle (a)). Cascade on the FK handles
 *     history rows for the wiped ACTIVE signals. Detection then
 *     runs synchronously (Phase 5b toggle (b)) so the response body
 *     contains the created count — no polling required.
 */
@Injectable()
export class CoreLayerAdminService {
    private readonly logger = new Logger(CoreLayerAdminService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly runtimeFlag: CoreLayerRuntimeFlagService,
        private readonly detection: CoreLayerDetectionService,
    ) {}

    async getStats(): Promise<CoreLayerAdminStatsDto> {
        const runtime = this.runtimeFlag.getStatus();
        const subHourRuntime = this.runtimeFlag.getSubHourStatus();

        const [total, byVariantRows, byAnchorRows, byVariantAndAnchorRows] =
            await Promise.all([
                this.prisma.coreLayerSignal.count({ where: { status: 'ACTIVE' } }),
                this.prisma.coreLayerSignal.groupBy({
                    by: ['variant'],
                    where: { status: 'ACTIVE' },
                    _count: true,
                }),
                this.prisma.coreLayerSignal.groupBy({
                    by: ['anchor'],
                    where: { status: 'ACTIVE' },
                    _count: true,
                }),
                this.prisma.coreLayerSignal.groupBy({
                    by: ['variant', 'anchor'],
                    where: { status: 'ACTIVE' },
                    _count: true,
                }),
            ]);

        const byVariant: Record<CoreLayerVariantKey, number> = {
            SE: 0,
            CRT: 0,
            BIAS: 0,
        };
        for (const r of byVariantRows as Array<{ variant: string; _count: number }>) {
            byVariant[r.variant as CoreLayerVariantKey] = r._count;
        }

        const byAnchor: Record<AnchorType, number> = {
            WEEKLY: 0,
            DAILY: 0,
            FOURHOUR: 0,
        };
        for (const r of byAnchorRows as Array<{ anchor: string; _count: number }>) {
            byAnchor[r.anchor as AnchorType] = r._count;
        }

        const byVariantAndAnchor = (
            byVariantAndAnchorRows as Array<{
                variant: string;
                anchor: string;
                _count: number;
            }>
        )
            .map((r) => ({
                variant: r.variant as CoreLayerVariantKey,
                anchor: r.anchor as AnchorType,
                count: r._count,
            }))
            .sort((a, b) => {
                if (a.variant !== b.variant) return a.variant.localeCompare(b.variant);
                return a.anchor.localeCompare(b.anchor);
            });

        return {
            runtime,
            subHourRuntime,
            activeSignalCount: {
                total,
                byVariant,
                byAnchor,
                byVariantAndAnchor,
            },
        };
    }

    async setEnabled(
        enabled: boolean,
        actor: string | undefined,
    ): Promise<CoreLayerAdminSetEnabledDto> {
        const previousEnabled = this.runtimeFlag.isEnabled();
        await this.runtimeFlag.setEnabled(enabled, actor);
        return { enabled, previousEnabled };
    }

    /**
     * Phase 7.3 — flip the sub-hour flag independently of the master
     * Core-Layer toggle (approved toggle (e)). Admin can leave master
     * ON while temporarily disabling 15m/5m event-driven scanning —
     * useful during Binance WS incidents or a noisy-pair investigation
     * without losing the hourly cron output.
     */
    async setSubHourEnabled(
        subHourEnabled: boolean,
        actor: string | undefined,
    ): Promise<CoreLayerAdminSetSubHourEnabledDto> {
        const previousSubHourEnabled = this.runtimeFlag.isSubHourEnabled();
        await this.runtimeFlag.setSubHourEnabled(subHourEnabled, actor);
        return { subHourEnabled, previousSubHourEnabled };
    }

    /**
     * Wipes ACTIVE rows + runs one synchronous detection pass.
     *
     * ACTIVE-only wipe keeps CLOSED history intact so the /pair detail
     * page's historical timeline survives a force-rescan. The cascade
     * handles the history rows FOR wiped ACTIVE signals only — history
     * belonging to CLOSED rows is never touched because those rows are
     * not in the DELETE target set.
     *
     * Detection runs with `now = Date.now()` so rebuilt signals get a
     * fresh detectedAt / lastPromotedAt. They start with no prior
     * history (only the immediate "created" event) — this is the
     * documented ADR side-effect and the UI surfaces it via the
     * confirmation dialog.
     */
    async forceRescan(): Promise<CoreLayerAdminForceRescanDto> {
        const startedAt = Date.now();

        // ACTIVE only — CLOSED rows and their history are preserved.
        const { count: wiped } = await this.prisma.coreLayerSignal.deleteMany({
            where: { status: 'ACTIVE' },
        });

        this.logger.log(`Force-rescan: wiped ${wiped} ACTIVE Core-Layer rows`);

        const detection = await this.detection.runDetection(Date.now());

        const elapsedMs = Date.now() - startedAt;
        this.logger.log(
            `Force-rescan: created=${detection.created} promoted=${detection.promoted} demoted=${detection.demoted} anchorChanged=${detection.anchorChanged} closed=${detection.closed} in ${elapsedMs}ms`,
        );

        return { wiped, detection, elapsedMs };
    }
}
