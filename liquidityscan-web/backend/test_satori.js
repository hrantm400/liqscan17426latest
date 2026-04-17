const satori = require('satori').default;
const { html } = require('satori-html');
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

function generateSvgChart(candles, width, height) {
    if (!candles || candles.length === 0) return '';
    const min = Math.min(...candles.map(c => c.low));
    const max = Math.max(...candles.map(c => c.high));
    const range = max - min || 1;
    const padding = range * 0.1;
    const actualMin = min - padding;
    const actualMax = max + padding;
    const actualRange = actualMax - actualMin;

    const candleWidth = width / candles.length;
    const spacing = candleWidth * 0.2;
    const rectWidth = candleWidth - spacing;

    let svgHtml = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display: flex;">`;

    candles.forEach((c, i) => {
        const x = i * candleWidth + spacing / 2;
        const color = c.close >= c.open ? '#13ec37' : '#ff3b30';

        const yHigh = height - ((c.high - actualMin) / actualRange) * height;
        const yLow = height - ((c.low - actualMin) / actualRange) * height;
        const yOpen = height - ((c.open - actualMin) / actualRange) * height;
        const yClose = height - ((c.close - actualMin) / actualRange) * height;

        const rectY = Math.min(yOpen, yClose);
        const rectH = Math.max(Math.abs(yClose - yOpen), 1);

        svgHtml += `<line x1="${x + rectWidth / 2}" y1="${yHigh}" x2="${x + rectWidth / 2}" y2="${yLow}" stroke="${color}" stroke-width="2" />`;
        svgHtml += `<rect x="${x}" y="${rectY}" width="${rectWidth}" height="${rectH}" fill="${color}" />`;
    });

    svgHtml += `</svg>`;
    return svgHtml;
}


async function testCard() {
    const symbol = 'BTCUSDT';
    const strategyType = 'CRT';
    const timeframe = '4h';
    const signalType = 'BUY_SIGNAL';
    const price = 64230.5;

    const mockCandles = Array.from({ length: 40 }).map((_, i) => {
        const base = 64000 + Math.sin(i / 5) * 500 + (Math.random() * 200 - 100);
        return {
            open: base,
            close: base + (Math.random() * 100 - 50),
            high: base + 100,
            low: base - 100
        };
    });

    const fontBuffer = fs.readFileSync(path.join(__dirname, 'src/telegram/Roboto-Bold.ttf'));

    const isBuy = signalType.includes('BUY');
    const color = isBuy ? '#13ec37' : '#ff3b30';
    const bgGradientStart = isBuy ? '#0a1f0f' : '#1f0a0a';

    const chartHtml = generateSvgChart(mockCandles, 800, 200);

    const markupHTML = `
        <div style="display: flex; flex-direction: column; width: 800px; height: 500px; background: linear-gradient(135deg, #0b140d 0%, ${bgGradientStart} 100%); color: white; padding: 40px; font-family: 'Roboto'; border: 3px solid ${color}; box-sizing: border-box; border-radius: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; width: 100%;">
                <div style="display: flex; align-items: center;">
                    <span style="font-size: 28px; font-weight: bold; color: rgba(255,255,255,0.6); margin-right: 10px;">LIQUIDITY</span>
                    <span style="font-size: 28px; font-weight: bold; color: white;">SCANNER</span>
                </div>
                <div style="display: flex; align-items: center; background: rgba(255,255,255,0.05); padding: 8px 20px; border-radius: 30px; border: 1px solid rgba(255,255,255,0.1);">
                    <span style="font-size: 20px; color: ${color}; font-weight: bold; margin-right: 12px;">●</span>
                    <span style="font-size: 20px; color: rgba(255,255,255,0.9);">${strategyType.replace('_', ' ')}</span>
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: 20px;">
                 <div style="display: flex; font-size: 64px; font-weight: bold; letter-spacing: -2px; color: white;">
                    ${symbol}
                </div>
                <div style="display: flex; font-size: 36px; font-weight: bold; color: ${color}; letter-spacing: 2px;">
                    ${signalType.replace('_SIGNAL', '')}
                </div>
            </div>

            <div style="display: flex; width: 100%; height: 200px; margin-top: 10px;">
                ${chartHtml}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: flex-end; width: 100%; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px; margin-top: 10px;">
                <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 16px; color: rgba(255,255,255,0.5); margin-bottom: 5px; letter-spacing: 1px;">ENTRY PRICE</span>
                    <span style="font-size: 32px; font-weight: bold; color: white;">$${price}</span>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end;">
                    <span style="font-size: 16px; color: rgba(255,255,255,0.5); margin-bottom: 5px; letter-spacing: 1px;">TIMEFRAME</span>
                    <span style="font-size: 32px; font-weight: bold; color: white;">${timeframe}</span>
                </div>
            </div>
        </div>
    `;

    const markup = html(markupHTML);

    const svg = await satori(markup, {
        width: 800,
        height: 500,
        fonts: [
            {
                name: 'Roboto',
                data: fontBuffer,
                weight: 700,
                style: 'normal',
            }
        ],
    });

    const resvg = new Resvg(svg, {
        background: '#0b140d',
    });

    const pngData = resvg.render();
    fs.writeFileSync('test_satori.png', pngData.asPng());
    console.log('Saved to test_satori.png');
}

testCard().catch(console.error);
