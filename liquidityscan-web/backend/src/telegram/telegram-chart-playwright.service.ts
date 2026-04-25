import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Browser } from 'playwright';

// Renamed: previously TelegramLwSignal — kept the legacy name as an alias
// in case anything else references it. The shape is engine-agnostic.
export type TelegramChartSignal = {
    signalType: string;
    price: number;
    symbol?: string;
    timeframe?: string;
    strategyType?: string;
};
export type TelegramLwSignal = TelegramChartSignal;

type OhlcCandle = { openTime: number; open: number; high: number; low: number; close: number };

/**
 * Headless klinecharts screenshot for Telegram (optional — requires `playwright` + Chromium).
 * Set TELEGRAM_CHART_PLAYWRIGHT=false to disable.
 *
 * Chunk #7 (narrow): migrated from lightweight-charts CDN to klinecharts
 * CDN. Visual surface unchanged from the LW baseline — same 920×440 dark
 * canvas, same candles, same single arrow + signalType label on the LAST
 * bar. No CISD/SE/RSI overlays in either version. The previous LW
 * implementation is preserved alongside this file as
 * `telegram-chart-playwright.service.ts.lw.bak` for rollback.
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

    async renderCandlestickPng(candles: OhlcCandle[], signal: TelegramChartSignal): Promise<Buffer | null> {
        if (this.disabled() || !candles?.length) return null;
        return this.enqueue(() => this.renderInner(candles, signal));
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

    private async renderInner(candles: OhlcCandle[], signal: TelegramChartSignal): Promise<Buffer | null> {
        const browser = await this.getBrowser();
        if (!browser) return null;
        const page = await browser.newPage({ viewport: { width: 920, height: 460 }, deviceScaleFactor: 1 });
        try {
            await page.goto('about:blank');
            await page.addStyleTag({
                content: 'body{margin:0;background:#0b140d;}#c{width:920px;height:440px}',
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
                        totalStep: 2,
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
                                    styles: { color: ext.color, size: 12, weight: 'bold', family: 'sans-serif' },
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
                                priceMark: {
                                    last: { show: true },
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
                    const label = (st || (isBuy ? 'BUY' : 'SELL')).slice(0, 24);
                    // anchor at low for buy (arrow points up from below the
                    // bar), high for sell (arrow points down from above)
                    const anchor = isBuy ? last.low : last.high;
                    chart.createOverlay({
                        name: 'tg-signal-arrow',
                        points: [{ timestamp: last.timestamp, value: anchor }],
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
            const buf = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 920, height: 440 } });
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
