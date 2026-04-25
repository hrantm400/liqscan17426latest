import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Browser } from 'playwright';

export type TelegramLwSignal = {
    signalType: string;
    price: number;
    symbol?: string;
    timeframe?: string;
    strategyType?: string;
};

type OhlcCandle = { openTime: number; open: number; high: number; low: number; close: number };

/**
 * Headless Lightweight Charts screenshot for Telegram (optional — requires `playwright` + Chromium).
 * Set TELEGRAM_CHART_PLAYWRIGHT=false to disable.
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

    async renderCandlestickPng(candles: OhlcCandle[], signal: TelegramLwSignal): Promise<Buffer | null> {
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

    private dedupeByTime(bars: { time: number; open: number; high: number; low: number; close: number }[]) {
        const map = new Map<number, (typeof bars)[0]>();
        for (const b of bars) {
            map.set(b.time, b);
        }
        return [...map.values()].sort((a, b) => a.time - b.time);
    }

    private async renderInner(candles: OhlcCandle[], signal: TelegramLwSignal): Promise<Buffer | null> {
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
                url: 'https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js',
            });
            await page.waitForFunction(
                () => typeof (window as unknown as { LightweightCharts?: unknown }).LightweightCharts !== 'undefined',
                { timeout: 20000 },
            );

            const raw = candles.map((c) => ({
                time: Math.floor(Number(c.openTime) / 1000),
                open: Number(c.open),
                high: Number(c.high),
                low: Number(c.low),
                close: Number(c.close),
            }));
            const lwData = this.dedupeByTime(raw);

            await page.evaluate(
                ({ bars, sig }: { bars: any[]; sig: TelegramLwSignal }) => {
                    const LW = (window as unknown as { LightweightCharts: any }).LightweightCharts;
                    const el = document.getElementById('c');
                    if (!el || !bars.length) return;
                    const chart = LW.createChart(el, {
                        layout: {
                            background: { type: 'solid', color: '#0b140d' },
                            textColor: '#b8b8b8',
                        },
                        grid: {
                            vertLines: { color: 'rgba(255,255,255,0.06)' },
                            horzLines: { color: 'rgba(255,255,255,0.06)' },
                        },
                        rightPriceScale: { borderColor: 'rgba(255,255,255,0.12)' },
                        timeScale: { borderColor: 'rgba(255,255,255,0.12)' },
                        width: 920,
                        height: 440,
                    });
                    const series = chart.addCandlestickSeries({
                        upColor: '#089981',
                        downColor: '#F23645',
                        borderVisible: false,
                        wickUpColor: '#089981',
                        wickDownColor: '#F23645',
                    });
                    series.setData(bars);
                    const st = String(sig.signalType || '');
                    const isBuy = st.includes('BUY');
                    const last = bars[bars.length - 1];
                    const label = (st || (isBuy ? 'BUY' : 'SELL')).slice(0, 24);
                    series.setMarkers([
                        {
                            time: last.time,
                            position: isBuy ? 'belowBar' : 'aboveBar',
                            color: isBuy ? '#089981' : '#F23645',
                            shape: isBuy ? 'arrowUp' : 'arrowDown',
                            text: label,
                        },
                    ]);
                    chart.timeScale().fitContent();
                },
                { bars: lwData, sig: signal },
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
