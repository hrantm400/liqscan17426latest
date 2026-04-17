// ============================================================
// chart.js — Chart Rendering with Lightweight Charts
// ============================================================

const ChartManager = (() => {
    let mainChart = null;
    let rsiChart = null;
    let candleSeries = null;
    let rsiSeries = null;
    let rsiMASeries = null;
    let overboughtLine = null;
    let oversoldLine = null;
    let midLine = null;
    let volumeSeries = null;

    // ICT Bias lines
    let biasHighLine = null;
    let biasLowLine = null;

    // Store candle data for marker mapping
    let storedCandles = [];

    const CHART_COLORS = {
        bg: '#0a0e17',
        grid: '#1a1e2e',
        text: '#848e9c',
        upColor: '#0ecb81',
        downColor: '#f6465d',
        borderUp: '#0ecb81',
        borderDown: '#f6465d',
        wickUp: '#0ecb81',
        wickDown: '#f6465d',
        rsiLine: '#d1d4dc',
        rsiMA: '#f0b90b',
        overbought: '#f6465d44',
        oversold: '#0ecb8144',
        volumeUp: 'rgba(14, 203, 129, 0.3)',
        volumeDown: 'rgba(246, 70, 93, 0.3)'
    };

    /**
     * Initialize both charts
     */
    function init(mainContainerId, rsiContainerId) {
        const mainContainer = document.getElementById(mainContainerId);
        const rsiContainer = document.getElementById(rsiContainerId);

        // ---- MAIN CHART ----
        mainChart = LightweightCharts.createChart(mainContainer, {
            layout: {
                background: { type: 'solid', color: CHART_COLORS.bg },
                textColor: CHART_COLORS.text,
                fontFamily: "'Inter', sans-serif"
            },
            grid: {
                vertLines: { color: CHART_COLORS.grid },
                horzLines: { color: CHART_COLORS.grid }
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: { color: '#ffffff33', width: 1, style: 3 },
                horzLine: { color: '#ffffff33', width: 1, style: 3 }
            },
            rightPriceScale: {
                borderColor: CHART_COLORS.grid,
                scaleMargins: { top: 0.05, bottom: 0.15 }
            },
            timeScale: {
                borderColor: CHART_COLORS.grid,
                timeVisible: true,
                secondsVisible: false
            },
            handleScroll: { vertTouchDrag: false }
        });

        candleSeries = mainChart.addCandlestickSeries({
            upColor: CHART_COLORS.upColor,
            downColor: CHART_COLORS.downColor,
            borderUpColor: CHART_COLORS.borderUp,
            borderDownColor: CHART_COLORS.borderDown,
            wickUpColor: CHART_COLORS.wickUp,
            wickDownColor: CHART_COLORS.wickDown
        });

        volumeSeries = mainChart.addHistogramSeries({
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
        });
        mainChart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.85, bottom: 0 }
        });

        // ---- RSI CHART ----
        rsiChart = LightweightCharts.createChart(rsiContainer, {
            layout: {
                background: { type: 'solid', color: CHART_COLORS.bg },
                textColor: CHART_COLORS.text,
                fontFamily: "'Inter', sans-serif"
            },
            grid: {
                vertLines: { color: CHART_COLORS.grid },
                horzLines: { color: CHART_COLORS.grid }
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal
            },
            rightPriceScale: {
                borderColor: CHART_COLORS.grid,
                scaleMargins: { top: 0.05, bottom: 0.05 }
            },
            timeScale: {
                borderColor: CHART_COLORS.grid,
                timeVisible: true,
                secondsVisible: false,
                visible: false
            },
            handleScroll: { vertTouchDrag: false }
        });

        rsiSeries = rsiChart.addLineSeries({
            color: CHART_COLORS.rsiLine,
            lineWidth: 1.5,
            priceFormat: { type: 'custom', formatter: (v) => v.toFixed(1) }
        });

        rsiMASeries = rsiChart.addLineSeries({
            color: CHART_COLORS.rsiMA,
            lineWidth: 1,
            lineStyle: 0,
            priceFormat: { type: 'custom', formatter: (v) => v.toFixed(1) }
        });

        // Overbought / Oversold / Mid lines
        overboughtLine = rsiChart.addLineSeries({
            color: '#f6465d55',
            lineWidth: 1,
            lineStyle: 2,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false
        });

        oversoldLine = rsiChart.addLineSeries({
            color: '#0ecb8155',
            lineWidth: 1,
            lineStyle: 2,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false
        });

        midLine = rsiChart.addLineSeries({
            color: '#848e9c33',
            lineWidth: 1,
            lineStyle: 2,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false
        });

        // Sync time scales
        mainChart.timeScale().subscribeVisibleTimeRangeChange(() => {
            const mainRange = mainChart.timeScale().getVisibleLogicalRange();
            if (mainRange) rsiChart.timeScale().setVisibleLogicalRange(mainRange);
        });

        rsiChart.timeScale().subscribeVisibleTimeRangeChange(() => {
            const rsiRange = rsiChart.timeScale().getVisibleLogicalRange();
            if (rsiRange) mainChart.timeScale().setVisibleLogicalRange(rsiRange);
        });

        // Resize
        handleResize(mainContainer, rsiContainer);

        return { mainChart, rsiChart };
    }

    function handleResize(mainContainer, rsiContainer) {
        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width } = entry.contentRect;
                if (entry.target === mainContainer && mainChart) {
                    mainChart.applyOptions({ width });
                }
                if (entry.target === rsiContainer && rsiChart) {
                    rsiChart.applyOptions({ width });
                }
            }
        });
        resizeObserver.observe(mainContainer);
        resizeObserver.observe(rsiContainer);
    }

    /**
     * Set candle data on both charts
     */
    function setData(candles, rsi, rsiMA) {
        storedCandles = candles;

        // Candlestick data
        candleSeries.setData(candles.map(c => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close
        })));

        // Volume
        volumeSeries.setData(candles.map(c => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? CHART_COLORS.volumeUp : CHART_COLORS.volumeDown
        })));

        // RSI data
        const rsiData = [];
        const rsiMAData = [];
        for (let i = 0; i < candles.length; i++) {
            if (!isNaN(rsi[i])) {
                rsiData.push({ time: candles[i].time, value: rsi[i] });
            }
            if (!isNaN(rsiMA[i])) {
                rsiMAData.push({ time: candles[i].time, value: rsiMA[i] });
            }
        }
        rsiSeries.setData(rsiData);
        rsiMASeries.setData(rsiMAData);

        // Reference lines for RSI
        const timeBounds = [
            { time: candles[0].time },
            { time: candles[candles.length - 1].time }
        ];
        overboughtLine.setData(timeBounds.map(t => ({ ...t, value: 70 })));
        oversoldLine.setData(timeBounds.map(t => ({ ...t, value: 30 })));
        midLine.setData(timeBounds.map(t => ({ ...t, value: 50 })));

        // Fit content
        mainChart.timeScale().fitContent();
        rsiChart.timeScale().fitContent();
    }

    /**
     * Update the latest candle (live)
     */
    function updateCandle(candle) {
        candleSeries.update({
            time: candle.time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close
        });

        volumeSeries.update({
            time: candle.time,
            value: candle.volume,
            color: candle.close >= candle.open ? CHART_COLORS.volumeUp : CHART_COLORS.volumeDown
        });
    }

    /**
     * Update RSI live
     */
    function updateRSI(time, rsiValue, rsiMAValue) {
        if (!isNaN(rsiValue)) {
            rsiSeries.update({ time, value: rsiValue });
        }
        if (!isNaN(rsiMAValue)) {
            rsiMASeries.update({ time, value: rsiMAValue });
        }
    }

    /**
     * Set markers on the main chart (SuperEngulfing + RSI Divergence on price)
     */
    function setMainMarkers(signals) {
        const markers = signals
            .filter(s => s.time)
            .map(s => ({
                time: s.time,
                position: s.position || (s.type.includes('bull') ? 'belowBar' : 'aboveBar'),
                color: s.color || '#fff',
                shape: s.position === 'belowBar' || s.type.includes('bull') ? 'arrowUp' : 'arrowDown',
                text: s.label || ''
            }))
            .sort((a, b) => a.time - b.time);

        candleSeries.setMarkers(markers);
    }

    /**
     * Set markers on the RSI chart (divergence dots)
     */
    function setRSIMarkers(signals) {
        const markers = signals
            .filter(s => s.time && s.rsiValue !== undefined)
            .map(s => ({
                time: s.time,
                position: s.type.includes('bull') ? 'belowBar' : 'aboveBar',
                color: s.color || '#fff',
                shape: 'circle',
                text: s.label || ''
            }))
            .sort((a, b) => a.time - b.time);

        rsiSeries.setMarkers(markers);
    }

    /**
     * Draw ICT Bias lines on the main chart
     */
    function drawICTBias(bias, prevHigh, prevLow, lastTime) {
        // Remove existing bias lines
        if (biasHighLine) {
            mainChart.removeSeries(biasHighLine);
            biasHighLine = null;
        }
        if (biasLowLine) {
            mainChart.removeSeries(biasLowLine);
            biasLowLine = null;
        }

        const biasColor = bias === 'Bullish' ? '#4CAF5088' : bias === 'Bearish' ? '#f4433688' : '#2196F388';

        biasHighLine = mainChart.addLineSeries({
            color: biasColor,
            lineWidth: 1,
            lineStyle: 2,
            crosshairMarkerVisible: false,
            lastValueVisible: true,
            priceLineVisible: false,
            title: `${bias} — High`
        });

        biasLowLine = mainChart.addLineSeries({
            color: biasColor,
            lineWidth: 1,
            lineStyle: 2,
            crosshairMarkerVisible: false,
            lastValueVisible: true,
            priceLineVisible: false,
            title: `${bias} — Low`
        });

        // Draw from a few bars back to a few bars forward
        const startTime = storedCandles.length > 5 ? storedCandles[storedCandles.length - 5].time : lastTime;
        biasHighLine.setData([
            { time: startTime, value: prevHigh },
            { time: lastTime, value: prevHigh }
        ]);
        biasLowLine.setData([
            { time: startTime, value: prevLow },
            { time: lastTime, value: prevLow }
        ]);
    }

    /**
     * Destroy charts
     */
    function destroy() {
        if (mainChart) { mainChart.remove(); mainChart = null; }
        if (rsiChart) { rsiChart.remove(); rsiChart = null; }
    }

    return {
        init,
        setData,
        updateCandle,
        updateRSI,
        setMainMarkers,
        setRSIMarkers,
        drawICTBias,
        destroy
    };
})();

window.ChartManager = ChartManager;
