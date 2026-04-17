/**
 * Tests for BinanceAPI from js/binance.js
 */

describe('BinanceAPI', () => {
    let originalFetch;

    beforeAll(() => {
        // Mock global window object
        global.window = {};

        // Load the script
        require('./binance.js');
    });

    beforeEach(() => {
        // Save original fetch
        originalFetch = global.fetch;

        // Mock fetch
        global.fetch = jest.fn();
    });

    afterEach(() => {
        // Restore original fetch
        global.fetch = originalFetch;
        jest.clearAllMocks();
    });

    describe('fetchPrice', () => {
        it('should fetch and return the current price successfully', async () => {
            const mockSymbol = 'BTCUSDT';
            const mockPrice = 65000.5;

            // Setup fetch mock
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ price: mockPrice.toString() })
            });

            const price = await window.BinanceAPI.fetchPrice(mockSymbol);

            expect(global.fetch).toHaveBeenCalledWith(
                `https://api.binance.com/api/v3/ticker/price?symbol=${mockSymbol}`
            );
            expect(price).toBe(mockPrice);
            expect(typeof price).toBe('number');
        });

        it('should throw an error when the response is not ok', async () => {
            const mockSymbol = 'INVALID';
            const errorStatus = 404;

            // Setup fetch mock for error response
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: errorStatus
            });

            await expect(window.BinanceAPI.fetchPrice(mockSymbol)).rejects.toThrow(
                `Binance API error: ${errorStatus}`
            );

            expect(global.fetch).toHaveBeenCalledWith(
                `https://api.binance.com/api/v3/ticker/price?symbol=${mockSymbol}`
            );
        });
    });
});
