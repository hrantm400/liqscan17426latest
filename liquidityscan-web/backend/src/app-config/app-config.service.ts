import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SINGLETON_ID = 'singleton';

@Injectable()
export class AppConfigService {
    private cache: { value: boolean; at: number } | null = null;
    private readonly CACHE_MS = 45_000;

    constructor(private readonly prisma: PrismaService) {}

    async ensureRow(): Promise<void> {
        await this.prisma.appConfig.upsert({
            where: { id: SINGLETON_ID },
            create: { id: SINGLETON_ID, launchPromoFullAccess: false },
            update: {},
        });
    }

    async getConfig(): Promise<{
        launchPromoFullAccess: boolean;
        cisdPivotLeft: number;
        cisdPivotRight: number;
        cisdMinConsecutive: number;
    }> {
        await this.ensureRow();
        const row = await this.prisma.appConfig.findUnique({
            where: { id: SINGLETON_ID },
            select: {
                launchPromoFullAccess: true,
                cisdPivotLeft: true,
                cisdPivotRight: true,
                cisdMinConsecutive: true,
            },
        });
        
        return {
            launchPromoFullAccess: row?.launchPromoFullAccess ?? false,
            cisdPivotLeft: row?.cisdPivotLeft ?? 5,
            cisdPivotRight: row?.cisdPivotRight ?? 2,
            cisdMinConsecutive: row?.cisdMinConsecutive ?? 2,
        };
    }

    async getLaunchPromoFullAccess(): Promise<boolean> {
        const config = await this.getConfig();
        return config.launchPromoFullAccess;
    }

    async setLaunchPromoFullAccess(enabled: boolean): Promise<void> {
        await this.ensureRow();
        await this.prisma.appConfig.update({
            where: { id: SINGLETON_ID },
            data: { launchPromoFullAccess: enabled },
        });
    }

    async setCisdConfig(data: { cisdPivotLeft: number; cisdPivotRight: number; cisdMinConsecutive: number }): Promise<void> {
        await this.ensureRow();
        await this.prisma.appConfig.update({
            where: { id: SINGLETON_ID },
            data,
        });
    }
}
