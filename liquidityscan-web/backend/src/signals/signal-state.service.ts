import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SignalStatus, SignalResult } from '@prisma/client';

@Injectable()
export class SignalStateService {
    private readonly logger = new Logger(SignalStateService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Centralized transition logic prevents invalid scattered states.
     * Safely updates both raw ENUM fields and deprecated string fields.
     * @returns false if the row no longer exists (Prisma P2025 — race with delete / concurrent job).
     */
    async transitionSignal(
        signalId: string,
        newStatus: SignalStatus,
        params?: { result?: SignalResult; closedPrice?: number; pnlPercent?: number }
    ): Promise<boolean> {
        const data: any = { lifecycleStatus: newStatus };

        // Strict enforcement
        if (newStatus === SignalStatus.COMPLETED) {
            if (!params?.result) throw new Error('COMPLETED state requires a result (WIN/LOSS)');
            data.result = params.result;
            if (params.closedPrice !== undefined) data.closedPrice = params.closedPrice;
            if (params.pnlPercent !== undefined) data.pnlPercent = Math.round(params.pnlPercent * 100) / 100;
            data.closedAt = new Date();

            // Keep old fields in sync for backward compatibility during migration
            data.status = params.result === SignalResult.WIN ? 'HIT_TP' : 'HIT_SL';
            data.outcome = data.status;
        }
        else if (newStatus === SignalStatus.EXPIRED) {
            if (params?.closedPrice !== undefined) data.closedPrice = params.closedPrice;
            data.closedAt = new Date();

            // Sync backward compat
            data.status = 'EXPIRED';
            data.outcome = 'EXPIRED';
        }
        else if (newStatus === SignalStatus.ARCHIVED) {
            // Keep closedAt or calculate it if missing, but usually ARCHIVED means it's already closed.
        }
        else if (newStatus === SignalStatus.ACTIVE) {
            data.status = 'ACTIVE';
            data.outcome = null;
        }

        try {
            await this.prisma.superEngulfingSignal.update({
                where: { id: signalId },
                data
            });
        } catch (err) {
            if (SignalStateService.isRecordNotFound(err)) {
                this.logger.warn(
                    `transitionSignal skipped: signal ${signalId} not found (P2025 — likely deleted concurrently)`,
                );
                return false;
            }
            throw err;
        }

        this.logger.log(`Signal ${signalId} transitioned to ${newStatus}`);
        return true;
    }

    private static isRecordNotFound(err: unknown): boolean {
        return (
            typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            (err as { code: string }).code === 'P2025'
        );
    }
}
