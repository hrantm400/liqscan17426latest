import { useMemo } from 'react';

interface TradingViewWidgetProps {
    symbol: string;
    interval?: string;
    theme: string;
    height?: string;
}

export function TradingViewWidget({
    symbol,
    interval: intervalProp,
    theme,
    height = '100%',
}: TradingViewWidgetProps) {
    // default interval to 1h (60) if missing
    const symbolParam = symbol.toUpperCase();
    const interval = (intervalProp != null && intervalProp !== '') ? String(intervalProp) : '60';

    // Build TradingView embed URL
    const widgetUrl = useMemo(() => {
        const params = new URLSearchParams({
            symbol: symbolParam,
            interval,
            theme: theme,
            style: '1',
            locale: 'en',
            toolbar_bg: '#f1f3f6',
            enable_publishing: 'false',
            hide_side_toolbar: 'true',
            allow_symbol_change: 'true',
            studies: '[]',
            show_popup_button: 'true',
            popup_width: '1000',
            popup_height: '650',
        });

        return `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_${Date.now()}&${params.toString()}`;
    }, [symbolParam, interval, theme]);

    return (
        <iframe
            src={widgetUrl}
            style={{
                width: '100%',
                height: height,
                border: 'none',
                margin: 0,
                padding: 0,
            }}
            allowFullScreen
            title="TradingView Chart"
        />
    );
}
