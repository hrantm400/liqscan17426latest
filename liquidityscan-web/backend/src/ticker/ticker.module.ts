import { Module } from '@nestjs/common';
import { TickerCacheService } from './ticker-cache.service';

/**
 * Ticker module — houses the in-memory 24h ticker cache used by
 * CoreLayerQueryService to enrich signal responses with live price and
 * change24h at read time. See {@link TickerCacheService} for the design
 * notes.
 *
 * Exports TickerCacheService so any future consumer (e.g. watchlist,
 * ICT bias page) can inject the same cache without double-polling.
 */
@Module({
    providers: [TickerCacheService],
    exports: [TickerCacheService],
})
export class TickerModule {}
