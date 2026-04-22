import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../app-config/app-config.service';

/**
 * CoreLayerTierResolverService — Phase 7.3.
 *
 * Computes the effective Core-Layer tier for a request given only the
 * raw `Authorization` header. The tier decision drives both the backend
 * authoritative filter (CoreLayerQueryService) and feeds the
 * `tier` field in the list / stats responses so the frontend can
 * render its lock UI consistently with what the server actually sent.
 *
 * Why not just reuse the existing JwtAuthGuard / PricingService?
 *
 *   - CoreLayerController is `@Public()`: anonymous users can browse
 *     Core-Layer signals. A strict JwtAuthGuard would 401 them. We
 *     need "optional auth" semantics — authenticated callers get
 *     their tier, anonymous callers get SCOUT.
 *   - PricingService.getTierInfo does a FeatureAccess.findMany and a
 *     dailyQuota reset. That is correct for the `/pricing/tier`
 *     endpoint but overkill on a high-frequency public read path.
 *     Here we only need one bit: "does this user have full product
 *     access?".
 *   - The controller reads at request rate. Per-user decisions are
 *     cached for 60 seconds to keep DB traffic flat.
 *
 * Tier semantics:
 *   - FULL_ACCESS → sees all chains, all TFs (1H+5m, 4H+15m), all
 *                   depths including 5-deep.
 *   - SCOUT       → anonymous OR authenticated without full product
 *                   access. Sees only chains whose TFs are a subset
 *                   of VISIBLE_TFS ∖ PRO_TFS, and depth < SCOUT_MAX_DEPTH.
 *                   Anonymous callers have no userId — they are always
 *                   SCOUT by construction.
 *
 * Effective tier follows PricingService's `hasFullProductAccess`: a
 * user with `tier !== FREE` is always FULL_ACCESS; a user with
 * `tier = FREE` is FULL_ACCESS only while the launch-promo global
 * AppConfig flag is on. Subscription expiry demotes the user to
 * FREE (that's how the billing side already writes the column), so
 * the "expired = SCOUT" rule from Phase 7.3 toggle (h) falls out
 * automatically from reading user.tier.
 */
export type CoreLayerEffectiveTier = 'FULL_ACCESS' | 'SCOUT';

interface CachedDecision {
    tier: CoreLayerEffectiveTier;
    expiresAt: number;
}

const DECISION_CACHE_TTL_MS = 60_000;
const DECISION_CACHE_MAX_ENTRIES = 5_000;

@Injectable()
export class CoreLayerTierResolverService {
    private readonly logger = new Logger(CoreLayerTierResolverService.name);
    private readonly cache = new Map<string, CachedDecision>();
    private readonly jwtSecret: string;

    constructor(
        private readonly jwt: JwtService,
        private readonly config: ConfigService,
        private readonly prisma: PrismaService,
        private readonly appConfig: AppConfigService,
    ) {
        this.jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
    }

    /**
     * Resolve the tier for a raw Authorization header value.
     * Anonymous / malformed / expired tokens → SCOUT.
     */
    async resolveFromAuthHeader(
        authHeader: string | undefined,
    ): Promise<CoreLayerEffectiveTier> {
        const userId = this.decodeUserId(authHeader);
        if (!userId) return 'SCOUT';

        const cached = this.cache.get(userId);
        const now = Date.now();
        if (cached && cached.expiresAt > now) {
            return cached.tier;
        }

        const tier = await this.resolveFromUserId(userId);

        // Bound the cache to avoid unbounded growth under token churn.
        if (this.cache.size >= DECISION_CACHE_MAX_ENTRIES) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }
        this.cache.set(userId, { tier, expiresAt: now + DECISION_CACHE_TTL_MS });
        return tier;
    }

    private decodeUserId(authHeader: string | undefined): string | null {
        if (!authHeader) return null;
        const m = /^Bearer\s+(.+)$/i.exec(authHeader);
        if (!m) return null;
        const token = m[1].trim();
        if (!token) return null;
        try {
            const payload = this.jwt.verify<Record<string, unknown>>(token, {
                secret: this.jwtSecret,
            });
            const id =
                (payload as any).sub ??
                (payload as any).userId ??
                (payload as any).id;
            return typeof id === 'string' ? id : null;
        } catch {
            // Expired / signature mismatch / malformed — treat as anonymous.
            return null;
        }
    }

    private async resolveFromUserId(userId: string): Promise<CoreLayerEffectiveTier> {
        try {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { tier: true },
            });
            if (!user) return 'SCOUT';
            if (user.tier !== 'FREE') return 'FULL_ACCESS';
            // FREE tier: launch promo lifts them to FULL_ACCESS.
            const promo = await this.appConfig.getLaunchPromoFullAccess();
            return promo ? 'FULL_ACCESS' : 'SCOUT';
        } catch (err) {
            // Fail closed: an unknown DB state returns SCOUT rather than
            // accidentally granting Pro access.
            this.logger.warn(
                `Tier resolve failed for userId=${userId}: ${(err as Error).message} — defaulting to SCOUT`,
            );
            return 'SCOUT';
        }
    }

    /** Test helper — flush the decision cache between specs. */
    invalidateCacheForTesting(): void {
        this.cache.clear();
    }
}
