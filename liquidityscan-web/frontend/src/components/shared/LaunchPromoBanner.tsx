import { useQuery } from '@tanstack/react-query';
import { userApi } from '../../services/userApi';

const BANNER_TEXT = '🔥Limited Time:Full Access for EVERYONE! 🔥';

/** Repeats per half of the loop (two halves = seamless infinite scroll). */
const COPIES_PER_SEGMENT = 6;

function MarqueeSegment() {
    return (
        <div className="flex shrink-0 items-center">
            {Array.from({ length: COPIES_PER_SEGMENT }, (_, i) => (
                <span
                    key={i}
                    className="inline-block shrink-0 whitespace-nowrap px-6 sm:px-10
                        dark:text-emerald-50
                        light:text-white light:[text-shadow:0_1px_2px_rgba(0,0,0,0.35)]"
                >
                    {BANNER_TEXT}
                </span>
            ))}
        </div>
    );
}

export function LaunchPromoBanner() {
    const { data } = useQuery({
        queryKey: ['public', 'site-status'],
        queryFn: () => userApi.getPublicSiteStatus(),
        staleTime: 90_000,
        refetchOnWindowFocus: true,
    });

    if (!data?.launchPromoFullAccess) return null;

    return (
        <div
            role="status"
            aria-label={BANNER_TEXT}
            className="w-full shrink-0 overflow-hidden py-2.5 text-xs sm:text-sm font-bold tracking-wide
                dark:bg-emerald-950/90 dark:text-emerald-100 dark:border-b dark:border-emerald-500/30
                light:bg-gradient-to-r light:from-emerald-950 light:via-emerald-900 light:to-emerald-950
                light:text-white light:border-b light:border-emerald-950/80 light:shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]"
        >
            <div
                className="launch-promo-marquee-fallback text-center font-bold
                    dark:text-emerald-50 light:text-white light:[text-shadow:0_1px_2px_rgba(0,0,0,0.35)]"
            >
                {BANNER_TEXT}
            </div>

            <div className="launch-promo-marquee-scroll" aria-hidden>
                <div className="launch-promo-marquee-track">
                    <MarqueeSegment />
                    <MarqueeSegment />
                </div>
            </div>
        </div>
    );
}
