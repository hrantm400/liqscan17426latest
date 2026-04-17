// ============================================================
// app.js — Main Application Controller
// ============================================================

const App = (() => {
    // State
    let candles = [];
    let currentSymbol = 'BTCUSDT';
    let currentInterval = '1h';

    // Popular symbols list (quick access)
    const POPULAR_SYMBOLS = [
        'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
        'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT',
        'LINKUSDT', 'LTCUSDT', 'UNIUSDT', 'ATOMUSDT', 'NEARUSDT'
    ];

    const INTERVALS = [
        { value: '1m', label: '1m' },
        { value: '5m', label: '5m' },
        { value: '15m', label: '15m' },
        { value: '30m', label: '30m' },
        { value: '1h', label: '1H' },
        { value: '4h', label: '4H' },
        { value: '1d', label: '1D' },
        { value: '1w', label: '1W' }
    ];

    /**
     * Initialize the app
     */
    async function init() {
        // Init charts
        ChartManager.init('main-chart', 'rsi-chart');

        // Populate UI
        populateIntervals();
        populateSymbols();

        // Event listeners
        document.getElementById('symbol-input').addEventListener('change', onSymbolChange);
        document.getElementById('symbol-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') onSymbolChange();
        });
        document.getElementById('load-btn').addEventListener('click', onSymbolChange);

        // Quick symbol buttons
        document.querySelectorAll('.symbol-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('symbol-input').value = btn.dataset.symbol;
                onSymbolChange();
            });
        });

        // Interval buttons
        document.querySelectorAll('.interval-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentInterval = btn.dataset.interval;
                loadData();
            });
        });

        // Settings toggles
        document.getElementById('toggle-bull-div').addEventListener('change', () => runIndicators());
        document.getElementById('toggle-bear-div').addEventListener('change', () => runIndicators());
        document.getElementById('toggle-hidden-bull').addEventListener('change', () => runIndicators());
        document.getElementById('toggle-hidden-bear').addEventListener('change', () => runIndicators());
        document.getElementById('toggle-run').addEventListener('change', () => runIndicators());
        document.getElementById('toggle-rev').addEventListener('change', () => runIndicators());

        // Set default interval active
        document.querySelector(`.interval-btn[data-interval="${currentInterval}"]`)?.classList.add('active');

        // Load initial data
        await loadData();
    }

    function populateIntervals() {
        const container = document.getElementById('interval-buttons');
        container.innerHTML = '';
        INTERVALS.forEach(iv => {
            const btn = document.createElement('button');
            btn.className = 'interval-btn';
            btn.dataset.interval = iv.value;
            btn.textContent = iv.label;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentInterval = iv.value;
                loadData();
            });
            container.appendChild(btn);
        });
    }

    function populateSymbols() {
        const container = document.getElementById('quick-symbols');
        container.innerHTML = '';
        POPULAR_SYMBOLS.forEach(sym => {
            const btn = document.createElement('button');
            btn.className = 'symbol-btn';
            btn.dataset.symbol = sym;
            btn.textContent = sym.replace('USDT', '');
            btn.addEventListener('click', () => {
                document.getElementById('symbol-input').value = sym;
                onSymbolChange();
            });
            container.appendChild(btn);
        });
    }

    function onSymbolChange() {
        const input = document.getElementById('symbol-input');
        const symbol = input.value.toUpperCase().trim();
        if (symbol && symbol !== currentSymbol) {
            currentSymbol = symbol;
            loadData();
        }
    }

    /**
     * Load candle data and run indicators
     */
    async function loadData() {
        setLoading(true);
        try {
            // Update header
            document.getElementById('current-symbol').textContent = currentSymbol;
            document.getElementById('current-interval').textContent = currentInterval.toUpperCase();

            // Highlight active symbol button
            document.querySelectorAll('.symbol-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.symbol === currentSymbol);
            });

            // Fetch data
            candles = await BinanceAPI.fetchKlines(currentSymbol, currentInterval, 500);
            if (!candles.length) throw new Error('No data received');

            // Run indicators and render
            runIndicators();

            // Subscribe to live updates
            BinanceAPI.subscribeKlines(currentSymbol, currentInterval, onLiveCandle);

            // Update price display
            const lastCandle = candles[candles.length - 1];
            updatePriceDisplay(lastCandle);

        } catch (err) {
            console.error('Failed to load data:', err);
            showError(`Failed to load ${currentSymbol}: ${err.message}`);
        }
        setLoading(false);
    }

    /**
     * Run all indicators on current candle data
     */
    function runIndicators() {
        if (!candles.length) return;

        // Read settings
        const config = {
            plotBull: document.getElementById('toggle-bull-div').checked,
            plotBear: document.getElementById('toggle-bear-div').checked,
            plotHiddenBull: document.getElementById('toggle-hidden-bull').checked,
            plotHiddenBear: document.getElementById('toggle-hidden-bear').checked
        };

        const engulfConfig = {
            showRun: document.getElementById('toggle-run').checked,
            showRev: document.getElementById('toggle-rev').checked
        };

        // 1. RSI Divergence
        const rsiResult = Indicators.detectRSIDivergence(candles, config);

        // 2. SuperEngulfing
        const engulfSignals = Indicators.detectSuperEngulfing(candles, engulfConfig);

        // 3. ICT Bias
        const ictResult = Indicators.detectICTBias(candles);

        // Set chart data
        ChartManager.setData(candles, rsiResult.rsi, rsiResult.rsiMA);

        // Combine all signals for the main chart
        const allMainSignals = [
            ...engulfSignals,
            ...rsiResult.signals.map(s => ({
                ...s,
                position: s.type.includes('bull') ? 'belowBar' : 'aboveBar',
                shape: s.type.includes('bull') ? 'arrowUp' : 'arrowDown'
            }))
        ];
        ChartManager.setMainMarkers(allMainSignals);

        // RSI chart markers
        ChartManager.setRSIMarkers(rsiResult.signals);

        // ICT Bias
        if (ictResult.bias !== 'Ranging' || ictResult.prevHigh > 0) {
            const lastTime = candles[candles.length - 1].time;
            ChartManager.drawICTBias(ictResult.bias, ictResult.prevHigh, ictResult.prevLow, lastTime);
        }

        // Update signal panel
        updateSignalPanel(rsiResult.signals, engulfSignals, ictResult);
        updateBiasDisplay(ictResult.bias);
    }

    /**
     * Handle live candle updates
     */
    function onLiveCandle(candle) {
        // Update or add candle
        if (candles.length > 0 && candles[candles.length - 1].time === candle.time) {
            candles[candles.length - 1] = candle;
        } else {
            candles.push(candle);
        }

        // Update price chart
        ChartManager.updateCandle(candle);
        updatePriceDisplay(candle);

        // Recalculate RSI for live update
        const closes = candles.map(c => c.close);
        const rsi = Indicators.calculateRSI(closes, 14);
        const rsiMA = Indicators.calculateMA(rsi, 14, 'SMA');
        const lastRSI = rsi[rsi.length - 1];
        const lastRSIMA = rsiMA[rsiMA.length - 1];
        ChartManager.updateRSI(candle.time, lastRSI, lastRSIMA);

        // Update RSI value display
        if (!isNaN(lastRSI)) {
            document.getElementById('rsi-value').textContent = lastRSI.toFixed(1);
            const rsiEl = document.getElementById('rsi-value');
            rsiEl.className = lastRSI > 70 ? 'stat-value overbought' : lastRSI < 30 ? 'stat-value oversold' : 'stat-value';
        }

        // If candle is final, re-run full indicators
        if (candle.isFinal) {
            runIndicators();
        }
    }

    /**
     * Update the signal panel
     */
    function updateSignalPanel(rsiSignals, engulfSignals, ictResult) {
        const container = document.getElementById('signal-list');
        container.innerHTML = '';

        // Get recent signals (last 20)
        const allSignals = [
            ...rsiSignals.map(s => ({
                ...s,
                indicator: 'RSI Div',
                direction: s.type.includes('bull') ? 'bull' : 'bear'
            })),
            ...engulfSignals.map(s => ({
                ...s,
                indicator: 'Engulfing',
                direction: s.type.includes('bull') ? 'bull' : 'bear'
            }))
        ].sort((a, b) => b.time - a.time).slice(0, 30);

        if (allSignals.length === 0) {
            container.innerHTML = '<div class="no-signals">No signals detected for current settings</div>';
            return;
        }

        allSignals.forEach(signal => {
            const div = document.createElement('div');
            div.className = `signal-item ${signal.direction}`;
            const date = new Date(signal.time * 1000);
            const timeStr = date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            div.innerHTML = `
                <div class="signal-header">
                    <span class="signal-badge ${signal.direction}">${signal.label}</span>
                    <span class="signal-indicator">${signal.indicator}</span>
                </div>
                <div class="signal-details">
                    <span class="signal-time">${timeStr}</span>
                    ${signal.price ? `<span class="signal-price">$${formatNumber(signal.price)}</span>` : ''}
                </div>
            `;
            container.appendChild(div);
        });

        // Update signal count
        document.getElementById('signal-count').textContent = allSignals.length;
    }

    /**
     * Update price display
     */
    function updatePriceDisplay(candle) {
        const priceEl = document.getElementById('current-price');
        const changeEl = document.getElementById('price-change');

        priceEl.textContent = '$' + formatNumber(candle.close);

        if (candles.length >= 2) {
            const prevClose = candles[candles.length - 2]?.close || candle.open;
            const change = ((candle.close - prevClose) / prevClose) * 100;
            changeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
            changeEl.className = 'price-change ' + (change >= 0 ? 'positive' : 'negative');
        }
    }

    function updateBiasDisplay(bias) {
        const el = document.getElementById('bias-value');
        el.textContent = bias;
        el.className = 'stat-value bias-' + bias.toLowerCase();
    }

    function setConnectionStatus(connected) {
        const dot = document.getElementById('connection-dot');
        const text = document.getElementById('connection-text');
        dot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
        text.textContent = connected ? 'Live' : 'Disconnected';
    }

    function setLoading(loading) {
        document.getElementById('loading-overlay').style.display = loading ? 'flex' : 'none';
    }

    function showError(message) {
        const el = document.getElementById('error-toast');
        el.textContent = message;
        el.style.display = 'block';
        setTimeout(() => el.style.display = 'none', 5000);
    }

    function formatNumber(num) {
        if (num >= 1000) return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (num >= 1) return num.toFixed(4);
        return num.toFixed(6);
    }

    return {
        init,
        setConnectionStatus,
        loadData,
        runIndicators
    };
})();

window.App = App;

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
