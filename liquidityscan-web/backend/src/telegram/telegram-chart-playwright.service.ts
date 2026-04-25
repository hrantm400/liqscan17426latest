import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Browser } from 'playwright';

// Renamed: previously TelegramLwSignal — kept the legacy name as an alias
// in case anything else references it. The shape is engine-agnostic.
//
// Optional fields beyond the minimum 5 (signalType, price, symbol, tf,
// strategyType) are read by the SE-overlay branch (Chunk #7b Phase A):
//   - id: used to gate the SE branch and (separately) to parse
//     detectedAtMs from its trailing `-{openTimeMs}` suffix
//   - signalCandleIdx: closest-bar index in the rendered candles array,
//     computed by the caller (telegram.service.ts) since playwright's
//     page.evaluate sandbox can't easily reach the candles utility
//   - metadata + the v2/v1 SL/TP keys: read by the inline readSeLines
//     helper, identical fallback chain to frontend's InteractiveLiveChart
export type TelegramChartSignal = {
    signalType: string;
    price: number;
    symbol?: string;
    timeframe?: string;
    strategyType?: string;
    id?: string;
    signalCandleIdx?: number;
    metadata?: Record<string, unknown>;
    // SE v2 fields (active writers — see prisma/schema.prisma SuperEngulfingSignal)
    sl_price?: number | null;
    current_sl_price?: number | null;
    tp1_price?: number | null;
    tp2_price?: number | null;
    tp3_price?: number | null;
    // SE v1 fields (legacy, still populated by the detector for back-compat)
    se_sl?: number | null;
    se_current_sl?: number | null;
    se_tp1?: number | null;
    se_tp2?: number | null;
};
export type TelegramLwSignal = TelegramChartSignal;

type OhlcCandle = { openTime: number; open: number; high: number; low: number; close: number };

/**
 * Headless klinecharts screenshot for Telegram (optional — requires `playwright` + Chromium).
 * Set TELEGRAM_CHART_PLAYWRIGHT=false to disable.
 *
 * Renders 920×440 dark canvas with:
 *   - candles + signal arrow on the last bar (always)
 *   - For SuperEngulfing signals (id starts with SUPER_ENGULFING):
 *     entry-price line (priceLine), SL/TP1/TP2/TP3 horizontal segments
 *     anchored at the signal candle, and short text labels (SL / TP1
 *     / TP2 / TP3) at the right edge of each segment. Visual parity
 *     with frontend InteractiveLiveChart's SE rendering — colors,
 *     dash patterns, and widths match exactly.
 */
@Injectable()
export class TelegramChartPlaywrightService implements OnModuleDestroy {
    private readonly logger = new Logger(TelegramChartPlaywrightService.name);
    private browser: Browser | null = null;
    private browserLaunch: Promise<Browser | null> | null = null;
    private chain: Promise<unknown> = Promise.resolve();

    private disabled(): boolean {
        const v = process.env.TELEGRAM_CHART_PLAYWRIGHT;
        if (v === undefined || v === '') return false;
        return ['0', 'false', 'no', 'off'].includes(String(v).trim().toLowerCase());
    }

    async onModuleDestroy() {
        if (this.browser) {
            await this.browser.close().catch(() => {});
            this.browser = null;
        }
    }

    private async getBrowser(): Promise<Browser | null> {
        if (this.disabled()) return null;
        if (this.browser) return this.browser;
        if (!this.browserLaunch) {
            this.browserLaunch = (async () => {
                try {
                    const { chromium } = await import('playwright');
                    const br = await chromium.launch({
                        headless: true,
                        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                    });
                    this.browser = br;
                    return br;
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    this.logger.warn(`Playwright Chromium not available (${msg}). Install browsers: npx playwright install chromium`);
                    return null;
                } finally {
                    this.browserLaunch = null;
                }
            })();
        }
        return this.browserLaunch;
    }

    async renderCandlestickPng(
        candles: OhlcCandle[],
        signal: TelegramChartSignal,
        dims: { width: number; height: number } = { width: 920, height: 440 },
    ): Promise<Buffer | null> {
        if (this.disabled() || !candles?.length) return null;
        return this.enqueue(() => this.renderInner(candles, signal, dims));
    }

    private enqueue<T>(fn: () => Promise<T>): Promise<T> {
        const run = this.chain.then(fn, fn);
        this.chain = run.then(
            () => undefined,
            () => undefined,
        );
        return run;
    }

    private dedupeByTimestamp(bars: { timestamp: number; open: number; high: number; low: number; close: number }[]) {
        const map = new Map<number, (typeof bars)[0]>();
        for (const b of bars) {
            map.set(b.timestamp, b);
        }
        return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
    }

    private async renderInner(
        candles: OhlcCandle[],
        signal: TelegramChartSignal,
        dims: { width: number; height: number },
    ): Promise<Buffer | null> {
        const browser = await this.getBrowser();
        if (!browser) return null;
        const { width, height } = dims;
        // Viewport gets +20px headroom for body margin / browser layout
        // (matches the original 920×460-vs-440 offset).
        const page = await browser.newPage({
            viewport: { width, height: height + 20 },
            deviceScaleFactor: 1,
        });
        try {
            await page.goto('about:blank');
            await page.addStyleTag({
                content: `body{margin:0;background:#0b140d;}#c{width:${width}px;height:${height}px}`,
            });
            await page.evaluate(() => {
                document.body.innerHTML = '<div id="c"></div>';
            });
            await page.addScriptTag({
                url: 'https://cdn.jsdelivr.net/npm/klinecharts@9.8.12/dist/umd/klinecharts.min.js',
            });
            await page.waitForFunction(
                () => typeof (window as unknown as { klinecharts?: unknown }).klinecharts !== 'undefined',
                { timeout: 20000 },
            );

            // klinecharts expects millisecond timestamps and a KLineData
            // shape. openTime is already a millisecond epoch from the
            // candles service, so no division/multiplication needed
            // (LW required seconds, hence the previous /1000).
            const raw = candles.map((c) => ({
                timestamp: Number(c.openTime),
                open: Number(c.open),
                high: Number(c.high),
                low: Number(c.low),
                close: Number(c.close),
            }));
            const kData = this.dedupeByTimestamp(raw);

            await page.evaluate(
                ({ bars, sig }: { bars: any[]; sig: TelegramChartSignal }) => {
                    const KC = (window as unknown as { klinecharts: any }).klinecharts;
                    const el = document.getElementById('c');
                    if (!el || !bars.length) return;

                    // Inline overlay matching LW's setMarkers + arrowUp /
                    // arrowDown shape. Keeps the renderer visually
                    // equivalent to the LW baseline: small filled triangle
                    // anchored a few px from the bar high/low, signalType
                    // text directly above/below the triangle.
                    KC.registerOverlay({
                        name: 'tg-signal-arrow',
                        totalStep: 1,
                        needDefaultPointFigure: false,
                        needDefaultXAxisFigure: false,
                        needDefaultYAxisFigure: false,
                        createPointFigures: ({ coordinates, overlay }: any) => {
                            const p = coordinates[0];
                            if (!p) return [];
                            const ext = overlay.extendData || {};
                            const isUp = ext.dir === 'up';
                            const tipOffset = 8;
                            const arrowSize = 10;
                            const tipY = isUp ? p.y + tipOffset : p.y - tipOffset;
                            const baseY = isUp ? tipY + arrowSize : tipY - arrowSize;
                            const labelY = isUp ? baseY + 4 : baseY - 4;
                            return [
                                {
                                    type: 'polygon',
                                    attrs: {
                                        coordinates: [
                                            { x: p.x, y: tipY },
                                            { x: p.x - 6, y: baseY },
                                            { x: p.x + 6, y: baseY },
                                        ],
                                    },
                                    styles: { color: ext.color, style: 'fill' },
                                },
                                {
                                    type: 'text',
                                    attrs: {
                                        x: p.x,
                                        y: labelY,
                                        text: String(ext.text || ''),
                                        align: 'center',
                                        baseline: isUp ? 'top' : 'bottom',
                                    },
                                    // Subtle dark pill behind the colored
                                    // text — same recipe as the SE-line
                                    // labels below for visual consistency.
                                    // The klinecharts default backgroundColor
                                    // is bright blue and would dominate; we
                                    // want a low-opacity black so the colored
                                    // text accent stays readable against any
                                    // candle body.
                                    styles: {
                                        color: ext.color,
                                        size: 12,
                                        weight: 'bold',
                                        family: 'sans-serif',
                                        backgroundColor: 'rgba(0, 0, 0, 0.65)',
                                        borderSize: 0,
                                        paddingLeft: 3,
                                        paddingRight: 3,
                                        paddingTop: 1,
                                        paddingBottom: 1,
                                    },
                                },
                            ];
                        },
                    });

                    // SE-line label overlay — small text figure anchored at
                    // the right edge of an SE TP/SL segment, sitting just
                    // above the line. Same defaults-stripping pattern as
                    // tg-signal-arrow's text figure: klinecharts default
                    // figure.text styles add a backgroundColor + 4px
                    // padding + 1px border, so without explicit overrides
                    // every label would render as a filled blue pill.
                    KC.registerOverlay({
                        name: 'tg-se-line-label',
                        totalStep: 1,
                        needDefaultPointFigure: false,
                        needDefaultXAxisFigure: false,
                        needDefaultYAxisFigure: false,
                        createPointFigures: ({ coordinates, overlay }: any) => {
                            const p = coordinates[0];
                            if (!p) return [];
                            const ext = overlay.extendData || {};
                            return [
                                {
                                    type: 'text',
                                    attrs: {
                                        x: p.x + 2,
                                        y: p.y - 6,
                                        text: String(ext.text || ''),
                                        align: 'left',
                                        baseline: 'bottom',
                                    },
                                    // Subtle dark pill behind the colored text
                                    // so labels stay readable against candle
                                    // bodies. NOT the default klinecharts blue
                                    // pill — explicit semi-transparent black,
                                    // tight padding, no border. Same recipe
                                    // applied to the BUY/SELL arrow label
                                    // below for visual consistency.
                                    styles: {
                                        color: ext.color || '#FFFFFF',
                                        size: 11,
                                        weight: 'bold',
                                        family: 'sans-serif',
                                        backgroundColor: 'rgba(0, 0, 0, 0.65)',
                                        borderSize: 0,
                                        paddingLeft: 3,
                                        paddingRight: 3,
                                        paddingTop: 1,
                                        paddingBottom: 1,
                                    },
                                },
                            ];
                        },
                    });

                    const chart = KC.init(el, {
                        styles: {
                            grid: {
                                horizontal: { color: 'rgba(255,255,255,0.06)' },
                                vertical: { color: 'rgba(255,255,255,0.06)' },
                            },
                            candle: {
                                bar: {
                                    upColor: '#089981',
                                    downColor: '#F23645',
                                    noChangeColor: '#089981',
                                    upBorderColor: '#089981',
                                    downBorderColor: '#F23645',
                                    noChangeBorderColor: '#089981',
                                    upWickColor: '#089981',
                                    downWickColor: '#F23645',
                                    noChangeWickColor: '#089981',
                                },
                                tooltip: { showRule: 'none' },
                                // Telegram surface is a static glance card — the
                                // last-price badge on the right axis collides with
                                // the signal-arrow label anchored at the rightmost
                                // bar (both end up at ~last close). Frontend keeps
                                // this badge enabled for hover/scroll context;
                                // here we restore LW-baseline parity by hiding it.
                                priceMark: {
                                    last: { show: false },
                                    high: { show: false },
                                    low: { show: false },
                                },
                            },
                            xAxis: {
                                axisLine: { color: 'rgba(255,255,255,0.12)' },
                                tickText: { color: '#b8b8b8' },
                            },
                            yAxis: {
                                axisLine: { color: 'rgba(255,255,255,0.12)' },
                                tickText: { color: '#b8b8b8' },
                            },
                        },
                    });
                    if (!chart) return;
                    chart.applyNewData(bars);

                    const st = String(sig.signalType || '');
                    const isBuy = st.includes('BUY');
                    const last = bars[bars.length - 1];

                    // SuperEngulfing-only overlays: entry line + SL/TP1-3
                    // segments + right-edge labels. Mirrors the frontend
                    // SE branch in InteractiveLiveChart (lines 603-648 +
                    // 759-787) — same colors, same dash patterns, same
                    // 5-bar lookback for segment x-start, same fallback
                    // chain for SL/TP values via inline readSeLines.
                    const isSe = typeof sig.id === 'string' && sig.id.indexOf('SUPER_ENGULFING') === 0;
                    const sigIdx = typeof sig.signalCandleIdx === 'number' ? sig.signalCandleIdx : -1;
                    if (isSe && sigIdx >= 0 && sigIdx < bars.length) {
                        const num = (v: any): number | null =>
                            typeof v === 'number' && isFinite(v) ? v : null;
                        const meta = (sig.metadata || {}) as Record<string, any>;
                        const sl =
                            num(sig.current_sl_price) ??
                            num(sig.sl_price) ??
                            num(sig.se_current_sl) ??
                            num(sig.se_sl) ??
                            num(meta.se_sl);
                        const tp1 =
                            num(sig.tp1_price) ?? num(sig.se_tp1) ?? num(meta.se_tp1);
                        const tp2 =
                            num(sig.tp2_price) ?? num(sig.se_tp2) ?? num(meta.se_tp2);
                        const tp3 = num(sig.tp3_price) ?? num(meta.tp3_price);

                        // Entry-price horizontal line (full-width priceLine,
                        // auto-labeled on the right axis by klinecharts).
                        const entryPrice =
                            typeof sig.price === 'number' && isFinite(sig.price)
                                ? sig.price
                                : Number(bars[sigIdx].close);
                        if (isFinite(entryPrice)) {
                            chart.createOverlay(
                                {
                                    name: 'priceLine',
                                    points: [{ value: entryPrice }],
                                    styles: {
                                        line: {
                                            color: isBuy ? '#089981' : '#F23645',
                                            size: 2,
                                            style: 'solid',
                                        },
                                    },
                                    lock: true,
                                },
                                'candle_pane',
                            );
                        }

                        // SL / TP1-3 segments. Label x-positions are
                        // staggered across the segment (SL at sigIdx-4,
                        // TP1 at sigIdx-3, TP2 at sigIdx-2, TP3 at sigIdx-1)
                        // so they don't pile on the same x-coordinate when
                        // prices are tight (e.g. ETHUSDT 4h SL/TP1/TP2/TP3
                        // span <1% of price). The right edge stays clean
                        // for the BUY/SELL arrow (anchored separately
                        // below at sigIdx).
                        const startIdx = Math.max(0, sigIdx - 5);
                        const startTs = bars[startIdx].timestamp;
                        const endTs = bars[bars.length - 1].timestamp;
                        const labelTs = (offset: number) =>
                            bars[Math.min(bars.length - 1, startIdx + offset)].timestamp;
                        const seg = (
                            price: number,
                            color: string,
                            style: 'solid' | 'dashed',
                            dashedValue: number[] | undefined,
                            size: number,
                            label: string,
                            labelOffset: number,
                        ) => {
                            chart.createOverlay({
                                name: 'segment',
                                points: [
                                    { timestamp: startTs, value: price },
                                    { timestamp: endTs, value: price },
                                ],
                                styles: {
                                    line: {
                                        color,
                                        size,
                                        style,
                                        ...(dashedValue ? { dashedValue } : {}),
                                    },
                                },
                                lock: true,
                            });
                            chart.createOverlay({
                                name: 'tg-se-line-label',
                                points: [{ timestamp: labelTs(labelOffset), value: price }],
                                extendData: { color, text: label },
                                lock: true,
                            });
                        };
                        if (sl !== null) {
                            seg(sl, '#F23645', 'dashed', [4, 4], 2, 'SL', 1);
                        }
                        if (tp1 !== null) {
                            seg(tp1, '#f59e0b', 'dashed', [2, 4], 1, 'TP1', 2);
                        }
                        if (tp2 !== null) {
                            seg(tp2, '#22d3ee', 'dashed', [2, 4], 1, 'TP2', 3);
                        }
                        if (tp3 !== null) {
                            seg(tp3, '#089981', 'solid', undefined, 2, 'TP3', 4);
                        }
                    }
                    // Glance-readable label only — the full strategyType + signalType
                    // string is already in the Telegram caption text below the image.
                    // Long labels rendered cramped/illegible in headless Chromium;
                    // BUY/SELL stays sharp at any size.
                    const label = isBuy ? 'BUY' : 'SELL';
                    // For SE signals with a known signal-candle index, anchor
                    // the arrow on the actual signal bar (more accurate AND
                    // separates the arrow from the right-edge price labels).
                    // For other signals, fall back to the last-bar
                    // approximation that's been the convention since PR #27.
                    const arrowBar =
                        isSe && sigIdx >= 0 && sigIdx < bars.length
                            ? bars[sigIdx]
                            : last;
                    // anchor at low for buy (arrow points up from below the
                    // bar), high for sell (arrow points down from above)
                    const anchor = isBuy ? arrowBar.low : arrowBar.high;
                    chart.createOverlay({
                        name: 'tg-signal-arrow',
                        points: [{ timestamp: arrowBar.timestamp, value: anchor }],
                        extendData: {
                            dir: isBuy ? 'up' : 'down',
                            color: isBuy ? '#089981' : '#F23645',
                            text: label,
                        },
                    });
                },
                { bars: kData, sig: signal },
            );

            await new Promise((r) => setTimeout(r, 500));
            const buf = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } });
            return Buffer.from(buf);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.warn(`Telegram chart screenshot failed: ${msg}`);
            return null;
        } finally {
            await page.close().catch(() => {});
        }
    }
}
