import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { PrismaService } from '../prisma/prisma.service';
import satori from 'satori';
import { html } from 'satori-html';
import { Resvg } from '@resvg/resvg-js';
import * as fs from 'fs';
import * as path from 'path';
import { CandlesService, CandleDto } from '../candles/candles.service';
import { PricingService } from '../pricing/pricing.service';
import { AlertsService } from '../alerts/alerts.service';
import { normalizeTimeframeForAlerts } from '../alerts/strategy-alert-config';
import { TelegramChartPlaywrightService } from './telegram-chart-playwright.service';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TelegramService.name);
    private bot: TelegramBot | null = null;
    private readonly isEnabled: boolean;
    private fontBuffer: Buffer | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly candlesService: CandlesService,
        private readonly pricingService: PricingService,
        private readonly alertsService: AlertsService,
        private readonly chartPlaywright: TelegramChartPlaywrightService,
    ) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        this.isEnabled = !!token;

        if (this.isEnabled && token) {
            // Suppress the node-telegram-bot-api deprecation warning regarding file buffers
            process.env.NTBA_FIX_350 = '1';

            // Use polling for local/simple deployments, configure webhooks for high scale if needed
            this.bot = new TelegramBot(token, { polling: true });
        } else {
            this.logger.warn('TELEGRAM_BOT_TOKEN not provided, alerting is disabled.');
        }
    }

    onModuleInit() {
        if (!this.bot) return;

        this.logger.log('Telegram Bot initialized');

        // Load the font file for Satori
        try {
            const fontPath = path.join(process.cwd(), 'src', 'telegram', 'Roboto-Bold.ttf');
            if (fs.existsSync(fontPath)) {
                this.fontBuffer = fs.readFileSync(fontPath);
            } else {
                this.logger.warn(`Font file not found at ${fontPath}. Signal Image Generation might fail.`);
            }
        } catch (err) {
            this.logger.error(`Failed to load font: ${err.message}`);
        }

        // /start with optional deep-link payload (website: t.me/bot?start=link_CODE)
        this.bot.onText(/\/start(?:\s+(.*))?/, async (msg, match) => {
            const chatId = msg.chat.id;
            const payload = match?.[1]?.trim();

            if (payload?.startsWith('link_')) {
                try {
                    const result = await this.alertsService.linkTelegramChatFromCode(
                        payload,
                        String(chatId),
                    );
                    const icon = result.ok ? '✅' : '❌';
                    await this.bot?.sendMessage(chatId, `${icon} ${result.message}`);
                } catch (e: any) {
                    this.logger.error(`Telegram link failed: ${e?.message || e}`);
                    await this.bot?.sendMessage(
                        chatId,
                        '❌ Could not complete linking. Try again from the website or paste your Chat ID manually.',
                    );
                }
                return;
            }

            const responseText =
                `👋 *Welcome to LiquidityScan alerts*\n\n` +
                `*Option A — one tap:* open the site → **Settings → Telegram alerts** → **Connect in Telegram** and press *Start* here.\n\n` +
                `*Option B — manual:* your Chat ID is:\n\`${chatId}\`\n` +
                `Paste it on the website under **Custom Alerts**.\n\n` +
                `Then add coin + strategy alerts on the site.`;

            await this.bot?.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
        });

        // Handle incoming errors to prevent crashes
        this.bot.on('polling_error', (error: any) => {
            if (error.code === 'EFATAL' || error.message?.includes('ETIMEDOUT')) {
                // Telegram long-polling timeouts are normal, just log as debug
                this.logger.debug(`Telegram polling timeout (auto-reconnecting)...`);
            } else if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
                this.logger.error('Telegram bot token is invalid (401 Unauthorized). Stopping polling.');
                this.bot?.stopPolling();
                this.bot = null;
            } else {
                this.logger.error(`Polling error: ${error.message || error}`);
            }
        });
    }

    onModuleDestroy() {
        if (this.bot) {
            this.bot.stopPolling();
            this.logger.log('Telegram Bot stopped');
        }
    }

    private generateSvgChart(candles: CandleDto[], width: number, height: number, signalColor: string, entryPrice: number): string {
        if (!candles || candles.length === 0) return '';
        const min = Math.min(...candles.map(c => c.low));
        const max = Math.max(...candles.map(c => c.high));
        const range = max - min || 1;
        const padding = range * 0.15;
        const actualMin = min - padding;
        const actualMax = max + padding;
        const actualRange = actualMax - actualMin;

        // Reserve 100px on the right for price labels
        const chartWidth = width - 100;
        const candleWidth = chartWidth / candles.length;
        const spacing = candleWidth * 0.2;
        const rectWidth = candleWidth - spacing;

        let svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="${chartWidth}" height="${height}" viewBox="0 0 ${chartWidth} ${height}" style="position: absolute; top: 0; left: 0; display: flex;">`;
        let overlayHtml = '';

        // 1. Draw Grid Lines & Y-Axis Labels
        const numLabels = 3;
        for (let i = 0; i < numLabels; i++) {
            const priceVal = actualMax - (i * (actualRange / (numLabels - 1)));
            const y = height - ((priceVal - actualMin) / actualRange) * height;

            svgHtml += `<line x1="0" y1="${y}" x2="${chartWidth}" y2="${y}" stroke="white" stroke-opacity="0.1" stroke-width="1" stroke-dasharray="4 4" />`;

            const formattedPrice = priceVal > 10 ? priceVal.toFixed(2) : priceVal > 0.1 ? priceVal.toFixed(4) : priceVal.toFixed(6);
            overlayHtml += `
            <div style="position: absolute; right: 0px; top: ${y - 8}px; width: 90px; display: flex; align-items: center;">
                <span style="color: rgba(255,255,255,0.5); font-size: 14px;">${formattedPrice}</span>
            </div>`;
        }

        // 2. Draw Entry Price Line (Dashed)
        const entryY = height - ((entryPrice - actualMin) / actualRange) * height;
        if (entryY >= 0 && entryY <= height) {
            svgHtml += `<line x1="0" y1="${entryY}" x2="${chartWidth}" y2="${entryY}" stroke="${signalColor}" stroke-width="2" stroke-dasharray="8 4" />`;
            const formattedEntry = entryPrice > 10 ? entryPrice.toFixed(2) : entryPrice > 0.1 ? entryPrice.toFixed(4) : entryPrice.toFixed(6);

            overlayHtml += `
            <div style="position: absolute; right: 0px; top: ${entryY - 12}px; width: 90px; height: 24px; background: rgba(${signalColor === '#13ec37' ? '19,236,55,0.2' : '255,59,48,0.2'}); border-radius: 4px; display: flex; align-items: center; padding-left: 8px;">
                <span style="color: ${signalColor}; font-size: 14px; font-weight: bold;">${formattedEntry}</span>
            </div>`;
        }

        // 3. Draw Candles
        candles.forEach((c, i) => {
            const x = i * candleWidth + spacing / 2;
            const color = c.close >= c.open ? '#13ec37' : '#ff3b30';

            const yHigh = height - ((c.high - actualMin) / actualRange) * height;
            const yLow = height - ((c.low - actualMin) / actualRange) * height;
            const yOpen = height - ((c.open - actualMin) / actualRange) * height;
            const yClose = height - ((c.close - actualMin) / actualRange) * height;

            const rectY = Math.min(yOpen, yClose);
            const rectH = Math.max(Math.abs(yClose - yOpen), 1);

            // Wick
            svgHtml += `<line x1="${x + rectWidth / 2}" y1="${yHigh}" x2="${x + rectWidth / 2}" y2="${yLow}" stroke="${color}" stroke-width="2" />`;
            // Body
            svgHtml += `<rect x="${x}" y="${rectY}" width="${rectWidth}" height="${rectH}" fill="${color}" />`;

            // Current Price Tracker (dot on the last candle)
            if (i === candles.length - 1) {
                svgHtml += `<circle cx="${x + rectWidth / 2}" cy="${yClose}" r="4" fill="${color}" />`;
            }
        });

        svgHtml += `</svg>`;

        // Return combined composition wrapped in a relative container
        return `
            <div style="position: relative; width: ${width}px; height: ${height}px; display: flex;">
                ${svgHtml}
                ${overlayHtml}
            </div>
        `;
    }

    /**
     * Generates a beautiful "Trading Card" style image for the signal using Satori & resvg-js.
     */
    private async generateSignalCard(
        symbol: string,
        strategyType: string,
        timeframe: string,
        signalType: string,
        price: number,
        metadata?: Record<string, any>,
        signalId?: string,
    ): Promise<Buffer | null> {
        const normTf = normalizeTimeframeForAlerts(timeframe);
        const candlesLw = await this.candlesService.getKlines(symbol, normTf, 120);
        if (candlesLw?.length) {
            // For SE signals, find the signal-candle index in the rendered
            // 120-bar window so the renderer can anchor TP/SL segment x-start
            // 5 bars before that bar (matches frontend InteractiveLiveChart).
            // Signal IDs are formatted `SUPER_ENGULFING-{symbol}-{tf}-{pattern}-{openTimeMs}`,
            // so the trailing -{number} suffix gives detectedAt directly without
            // plumbing a separate field through.
            let signalCandleIdx: number | undefined;
            if (signalId && signalId.indexOf('SUPER_ENGULFING') === 0) {
                const m = /-(\d+)$/.exec(signalId);
                if (m) {
                    const detectedAtMs = Number(m[1]);
                    if (Number.isFinite(detectedAtMs)) {
                        let bestIdx = -1;
                        let bestDiff = Infinity;
                        for (let i = 0; i < candlesLw.length; i++) {
                            const diff = Math.abs(
                                Number((candlesLw[i] as any).openTime) - detectedAtMs,
                            );
                            if (diff < bestDiff) {
                                bestDiff = diff;
                                bestIdx = i;
                            }
                        }
                        if (bestIdx >= 0) signalCandleIdx = bestIdx;
                    }
                }
            }

            // Defensive: pull SE v2/v1 fields from metadata into top-level
            // signal payload so the renderer's inline readSeLines fallback
            // chain finds them. We don't have direct access to the DB row's
            // columns at this layer — only the metadata blob — but the SE
            // detector writes the same v2 keys (sl_price, tp1_price, …)
            // into metadata, so the readSeLines chain still resolves.
            const seFields: Record<string, number | null | undefined> = {};
            if (signalId && signalId.indexOf('SUPER_ENGULFING') === 0 && metadata) {
                for (const k of [
                    'sl_price', 'current_sl_price',
                    'tp1_price', 'tp2_price', 'tp3_price',
                    'se_sl', 'se_current_sl', 'se_tp1', 'se_tp2',
                ]) {
                    if (metadata[k] !== undefined) seFields[k] = metadata[k];
                }
            }

            const png = await this.chartPlaywright.renderCandlestickPng(candlesLw, {
                signalType,
                price,
                symbol,
                timeframe: normTf,
                strategyType,
                id: signalId,
                signalCandleIdx,
                metadata,
                ...seFields,
            });
            if (png) return png;
        }

        if (!this.fontBuffer) return null;

        const isBuy = signalType.includes('BUY');
        const color = isBuy ? '#13ec37' : '#ff3b30';
        const bgGradientStart = isBuy ? '#0a1f0f' : '#1f0a0a';

        const candles = await this.candlesService.getKlines(symbol, normTf, 50);
        const chartHtml = this.generateSvgChart(candles, 800, 200, color, price);

        // Build strategy-specific info row
        let infoRowHtml = '';
        if (strategyType === 'SUPER_ENGULFING' && metadata) {
            const pattern = metadata.pattern || '';
            const sl = metadata.se_sl ? `$${Number(metadata.se_sl).toFixed(4)}` : '—';
            const tp2 = metadata.se_tp2 ? `$${Number(metadata.se_tp2).toFixed(4)}` : '—';
            infoRowHtml = `
                <div style="display: flex; justify-content: space-between; width: 100%; margin-top: 8px; padding: 12px 0; border-top: 1px dashed rgba(255,255,255,0.08);">
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <span style="font-size: 11px; color: rgba(255,255,255,0.4); letter-spacing: 2px;">PATTERN</span>
                        <span style="font-size: 18px; font-weight: bold; color: ${color};">${pattern}</span>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <span style="font-size: 11px; color: rgba(255,255,255,0.4); letter-spacing: 2px;">STOP LOSS</span>
                        <span style="font-size: 18px; font-weight: bold; color: #ff4444;">${sl}</span>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <span style="font-size: 11px; color: rgba(255,255,255,0.4); letter-spacing: 2px;">TARGET</span>
                        <span style="font-size: 18px; font-weight: bold; color: #13ec37;">${tp2}</span>
                    </div>
                </div>`;
        } else if (strategyType === 'ICT_BIAS' && metadata) {
            const bias = metadata.bias || '';
            const level = metadata.bias_level ? `$${Number(metadata.bias_level).toFixed(4)}` : '—';
            infoRowHtml = `
                <div style="display: flex; justify-content: space-between; width: 100%; margin-top: 8px; padding: 12px 0; border-top: 1px dashed rgba(255,255,255,0.08);">
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <span style="font-size: 11px; color: rgba(255,255,255,0.4); letter-spacing: 2px;">BIAS</span>
                        <span style="font-size: 18px; font-weight: bold; color: ${color};">${bias}</span>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <span style="font-size: 11px; color: rgba(255,255,255,0.4); letter-spacing: 2px;">BIAS LEVEL</span>
                        <span style="font-size: 18px; font-weight: bold; color: #00bcd4;">${level}</span>
                    </div>
                </div>`;
        }

        const displayDirection = isBuy ? '▲ LONG' : '▼ SHORT';

        const markupHtml = `
            <div style="display: flex; flex-direction: column; width: 800px; height: 520px; background: linear-gradient(135deg, #0b140d 0%, ${bgGradientStart} 100%); color: white; padding: 40px; font-family: 'Roboto'; border: 3px solid ${color}; box-sizing: border-box; border-radius: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; width: 100%;">
                    <div style="display: flex; align-items: center;">
                        <span style="font-size: 28px; font-weight: bold; color: rgba(255,255,255,0.6); margin-right: 10px;">LIQUIDITY</span>
                        <span style="font-size: 28px; font-weight: bold; color: white;">SCANNER</span>
                    </div>
                    <div style="display: flex; align-items: center; background: rgba(255,255,255,0.05); padding: 8px 20px; border-radius: 30px; border: 1px solid rgba(255,255,255,0.1);">
                        <span style="font-size: 20px; color: ${color}; font-weight: bold; margin-right: 12px;">●</span>
                        <span style="font-size: 20px; color: rgba(255,255,255,0.9);">${strategyType.replace(/_/g, ' ')}</span>
                    </div>
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: 20px;">
                     <div style="display: flex; font-size: 56px; font-weight: bold; letter-spacing: -2px; color: white;">
                        ${symbol}
                    </div>
                    <div style="display: flex; font-size: 32px; font-weight: bold; color: ${color}; letter-spacing: 2px;">
                        ${displayDirection}
                    </div>
                </div>

                <div style="display: flex; width: 100%; height: 180px; margin-top: 8px;">
                    ${chartHtml}
                </div>

                ${infoRowHtml}

                <div style="display: flex; justify-content: space-between; align-items: flex-end; width: 100%; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px; margin-top: 8px;">
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 14px; color: rgba(255,255,255,0.5); margin-bottom: 4px; letter-spacing: 1px;">ENTRY PRICE</span>
                        <span style="font-size: 28px; font-weight: bold; color: white;">$${price}</span>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end;">
                        <span style="font-size: 14px; color: rgba(255,255,255,0.5); margin-bottom: 4px; letter-spacing: 1px;">TIMEFRAME</span>
                        <span style="font-size: 28px; font-weight: bold; color: white;">${normTf.toUpperCase()}</span>
                    </div>
                </div>
            </div>
        `;

        const markup = html(markupHtml as any);

        try {
            const svg = await satori(markup, {
                width: 800,
                height: 520,
                fonts: [
                    {
                        name: 'Roboto',
                        data: this.fontBuffer,
                        weight: 700,
                        style: 'normal',
                    }
                ],
            });

            const resvg = new Resvg(svg, {
                background: '#0b140d',
                font: { loadSystemFonts: false }
            });

            const pngData = resvg.render();
            return pngData.asPng();
        } catch (err) {
            this.logger.error(`Failed to generate Satori image: ${err.message}`);
            return null;
        }
    }

    /**
     * Dispatch a strategy signal to users subscribed to this symbol + strategy (RSI legacy keys included).
     */
    async sendSignalAlert(
        symbol: string,
        strategyType: string,
        timeframe: string,
        signalType: string,
        price: number,
        metadata?: Record<string, any>,
        signalId?: string,
    ) {
        if (!this.bot) return;

        try {
            const subs = await this.prisma.alertSubscription.findMany({
                where: { symbol, strategyType, isActive: true },
                include: { user: true },
            });

            if (subs.length === 0) return;

            const signalTf = normalizeTimeframeForAlerts(timeframe);

            const directionEmoji = signalType.includes('BUY') ? '🟢' : '🔴';
            const directionKey = signalType.includes('BUY') ? 'BUY' : 'SELL';
            const direction = signalType.includes('BUY') ? '▲ LONG' : '▼ SHORT';

            // Escape Markdown special characters in dynamic values
            const esc = (s: string | number) => String(s).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');

            // Build strategy-specific details
            let details = '';
            if (strategyType === 'SUPER_ENGULFING' && metadata) {
                const pattern = metadata.pattern || '';
                // SE values: prefer v2 keys (sl_price, tp1-3_price), fall
                // back to v1 (se_sl, se_tp1, se_tp2) for legacy signals
                // emitted before the v2 schema was wired up. Mirrors the
                // frontend readSeLines fallback chain.
                const num = (v: any): number | null =>
                    typeof v === 'number' && Number.isFinite(v) ? v : null;
                const entry = num(metadata.entry_price) ?? Number(price);
                const sl =
                    num(metadata.current_sl_price) ??
                    num(metadata.sl_price) ??
                    num(metadata.se_current_sl) ??
                    num(metadata.se_sl);
                const tp1 = num(metadata.tp1_price) ?? num(metadata.se_tp1);
                const tp2 = num(metadata.tp2_price) ?? num(metadata.se_tp2);
                const tp3 = num(metadata.tp3_price);
                // Format value to 4 decimals if < 10, 2 otherwise — matches
                // the existing TP/SL formatting (Number(x).toFixed(4)) but
                // adapts for high-priced assets like ETH/BTC where 4 dp is
                // unnecessarily noisy.
                const fmt = (v: number) =>
                    v >= 10 ? v.toFixed(2) : v.toFixed(4);
                // Pad label to 5 chars so the colon column aligns:
                //   Entry: …    SL:    …    TP1:   …    TP2:   …    TP3:   …
                // Wrapped in a triple-backtick code fence for monospace
                // rendering (Markdown parse_mode) — that's the only way
                // to get vertical alignment in a Telegram caption.
                const padLabel = (s: string) => (s + ':').padEnd(7, ' ');
                const lines: string[] = [];
                if (Number.isFinite(entry)) {
                    lines.push(`📍 ${padLabel('Entry')}${fmt(entry)}`);
                }
                if (sl !== null) lines.push(`🛑 ${padLabel('SL')}${fmt(sl)}`);
                if (tp1 !== null) lines.push(`🎯 ${padLabel('TP1')}${fmt(tp1)}`);
                if (tp2 !== null) lines.push(`🎯 ${padLabel('TP2')}${fmt(tp2)}`);
                if (tp3 !== null) lines.push(`🎯 ${padLabel('TP3')}${fmt(tp3)}`);
                if (lines.length > 0) {
                    details += '```\n' + lines.join('\n') + '\n```\n';
                }
                if (pattern) details += `📋 *Pattern:* ${esc(pattern)}\n`;
            } else if (strategyType === 'ICT_BIAS' && metadata) {
                if (metadata.bias) details += `🧭 *Bias:* ${esc(metadata.bias)}\n`;
                if (metadata.bias_level) details += `📍 *Bias Level:* ${esc(Number(metadata.bias_level).toFixed(4))}\n`;
            } else if (strategyType === 'CRT' && metadata) {
                const dir = metadata.crt_direction || (signalType.includes('BUY') ? 'BULLISH' : 'BEARISH');
                details += `🎯 *CRT:* ${esc(dir)}\n`;
                if (metadata.swept_level) details += `🔻 *Swept Level:* ${esc(Number(metadata.swept_level).toFixed(4))}\n`;
                if (metadata.sweep_extreme) details += `📍 *Sweep Extreme:* ${esc(Number(metadata.sweep_extreme).toFixed(4))}\n`;
                if (metadata.prev_high) details += `⬆ *Prev High:* ${esc(Number(metadata.prev_high).toFixed(4))}\n`;
                if (metadata.prev_low) details += `⬇ *Prev Low:* ${esc(Number(metadata.prev_low).toFixed(4))}\n`;
            }

            const strategyLabel = esc(strategyType.replace(/_/g, ' '));

            const base =
                (process.env.FRONTEND_URL || 'https://liquidityscan.io')
                    .split(',')[0]
                    .trim()
                    .replace(/\/$/, '') || 'https://liquidityscan.io';
            const openLink = signalId
                ? `${base}/signals/${encodeURIComponent(signalId)}`
                : base;

            const message =
                `${directionEmoji} *NEW SIGNAL ALERT* ${directionEmoji}\n\n` +
                `🪙 *Asset:* ${esc(symbol)}\n` +
                `📊 *Strategy:* ${strategyLabel}\n` +
                `⏳ *Timeframe:* ${esc(signalTf.toUpperCase())}\n` +
                `📈 *Direction:* ${direction}\n` +
                `💲 *Price:* ${esc(price)}\n` +
                (details ? `\n${details}` : '') +
                `\n[Open on LiquidityScan](${openLink})`;

            const imageBuffer = await this.generateSignalCard(symbol, strategyType, timeframe, signalType, price, metadata, signalId);

            let msgsSent = 0;
            let skipped = 0;

            const alertPromises = subs.map(async (sub) => {
                const allowed = await this.pricingService.canAccessSymbol(sub.userId, symbol);
                if (!allowed) {
                    skipped++;
                    return;
                }

                // --- Apply rich filters ---
                // 1. Timeframe filter (canonical TF vs stored subscription list)
                if (sub.timeframes && Array.isArray(sub.timeframes)) {
                    const subTfs = (sub.timeframes as string[]).map((t) => normalizeTimeframeForAlerts(t));
                    if (!subTfs.includes(signalTf)) {
                        skipped++;
                        return;
                    }
                }

                // 2. Direction filter
                if (sub.directions && Array.isArray(sub.directions)) {
                    if (!(sub.directions as string[]).includes(directionKey)) {
                        skipped++;
                        return;
                    }
                }

                // Send alert if user has associated their telegramId
                if (sub.user.telegramId) {
                    try {
                        if (imageBuffer) {
                            await this.bot.sendPhoto(
                                sub.user.telegramId,
                                imageBuffer,
                                {
                                    caption: message,
                                    parse_mode: 'Markdown'
                                },
                                {
                                    filename: 'signal.png',
                                    contentType: 'image/png',
                                }
                            );
                        } else {
                            // Fallback to text only if image fails
                            await this.bot.sendMessage(sub.user.telegramId, message, { parse_mode: 'Markdown' });
                        }
                        msgsSent++;
                    } catch (e) {
                        this.logger.error(`Failed to send telegram alert to ${sub.user.telegramId}: ${e.message}`, e.stack);
                    }
                }
            });

            await Promise.allSettled(alertPromises);

            this.logger.log(`Sent ${msgsSent} Telegram alerts for ${symbol} via ${strategyType} (skipped ${skipped} by filters)`);
        } catch (err) {
            this.logger.error(`Error sending signal alert block: ${err.message}`);
        }
    }

    async sendSubscriptionReminder(chatId: string, daysLeft: number) {
        if (!this.bot) return;
        const n = Number(daysLeft);
        const dayLabel = n === 1 ? 'day' : 'days';

        const message =
            `⏳ *Subscription renewal reminder*\n\n` +
            `Your Liquidity Scan PRO subscription expires in *${n} ${dayLabel}*.\n\n` +
            `Renew now to keep full access to all signals, strategies, and alerts:\n` +
            `https://liquidityscan.io/subscription\n\n` +
            `If you don't renew, your account will be downgraded to the Free tier.`;

        try {
            await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (e: any) {
            this.logger.error(`Failed to send subscription reminder to ${chatId}: ${e.message}`, e.stack);
        }
    }

    async sendDirectMessage(chatId: string, message: string, parseMode: 'Markdown' | 'HTML' = 'Markdown') {
        if (!this.bot) return;
        try {
            await this.bot.sendMessage(chatId, message, { parse_mode: parseMode });
        } catch (e: any) {
            this.logger.error(`Failed to send direct Telegram message to ${chatId}: ${e.message}`, e.stack);
            throw e;
        }
    }
}
