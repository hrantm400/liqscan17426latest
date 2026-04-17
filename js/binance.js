// ============================================================
// binance.js — Binance Public API Integration
// ============================================================

const BinanceAPI = (() => {
    const BASE_URL = 'https://api.binance.com';
    const WS_URL = 'wss://stream.binance.com:9443/ws';

    let ws = null;
    let onCandleUpdate = null;
    let currentSymbol = null;
    let currentInterval = null;

    /**
     * Fetch klines (candlestick data) from Binance
     * @param {string} symbol - e.g. 'BTCUSDT'
     * @param {string} interval - e.g. '1h', '4h', '1d'
     * @param {number} limit - number of candles (max 1000)
     * @returns {Promise<Object[]>} Array of {time, open, high, low, close, volume}
     */
    async function fetchKlines(symbol, interval = '1h', limit = 500) {
        const url = `${BASE_URL}/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Binance API error: ${response.status}`);
        const data = await response.json();

        return data.map(k => ({
            time: Math.floor(k[0] / 1000), // Convert ms to seconds for lightweight-charts
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
        }));
    }

    /**
     * Fetch exchange info to get available symbols
     */
    async function fetchSymbols() {
        const url = `${BASE_URL}/api/v3/exchangeInfo`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Binance API error: ${response.status}`);
        const data = await response.json();

        return data.symbols
            .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
            .map(s => s.symbol)
            .sort();
    }

    /**
     * Fetch current price for a symbol
     */
    async function fetchPrice(symbol) {
        const url = `${BASE_URL}/api/v3/ticker/price?symbol=${symbol.toUpperCase()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Binance API error: ${response.status}`);
        const data = await response.json();
        return parseFloat(data.price);
    }

    /**
     * Subscribe to live kline updates via WebSocket
     * @param {string} symbol
     * @param {string} interval
     * @param {Function} callback - called with {time, open, high, low, close, volume, isFinal}
     */
    function subscribeKlines(symbol, interval, callback) {
        // Close existing connection
        if (ws) {
            ws.close();
            ws = null;
        }

        onCandleUpdate = callback;
        currentSymbol = symbol.toLowerCase();
        currentInterval = interval;

        const stream = `${currentSymbol}@kline_${currentInterval}`;
        ws = new WebSocket(`${WS_URL}/${stream}`);

        ws.onopen = () => {
            console.log(`[Binance WS] Connected: ${stream}`);
            if (window.App) window.App.setConnectionStatus(true);
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.e === 'kline') {
                const k = msg.k;
                const candle = {
                    time: Math.floor(k.t / 1000),
                    open: parseFloat(k.o),
                    high: parseFloat(k.h),
                    low: parseFloat(k.l),
                    close: parseFloat(k.c),
                    volume: parseFloat(k.v),
                    isFinal: k.x
                };
                if (onCandleUpdate) onCandleUpdate(candle);
            }
        };

        ws.onerror = (err) => {
            console.error('[Binance WS] Error:', err);
            if (window.App) window.App.setConnectionStatus(false);
        };

        ws.onclose = () => {
            console.log('[Binance WS] Disconnected');
            if (window.App) window.App.setConnectionStatus(false);
        };
    }

    /**
     * Unsubscribe / close WebSocket
     */
    function unsubscribe() {
        if (ws) {
            ws.close();
            ws = null;
        }
    }

    return {
        fetchKlines,
        fetchSymbols,
        fetchPrice,
        subscribeKlines,
        unsubscribe
    };
})();

window.BinanceAPI = BinanceAPI;
