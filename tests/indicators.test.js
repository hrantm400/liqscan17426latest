const { calculateRSI } = require('../js/indicators.js');

describe('calculateRSI', () => {
    it('returns an array of NaNs if closes length is less than length + 1', () => {
        const closes = [1, 2, 3];
        const result = calculateRSI(closes, 14);
        expect(result).toHaveLength(3);
        result.forEach(val => expect(val).toBeNaN());
    });

    it('returns NaN for the first `length` elements', () => {
        const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]; // Length 15
        const result = calculateRSI(closes, 14);

        expect(result).toHaveLength(15);

        for (let i = 0; i < 14; i++) {
            expect(result[i]).toBeNaN();
        }
        expect(result[14]).not.toBeNaN();
    });

    it('handles constant uptrend correctly (avgLoss === 0)', () => {
        const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
        const result = calculateRSI(closes, 14);

        // Given constant uptrend, avgLoss is 0, so RSI should be 100 for all calculated values
        expect(result[14]).toBe(100);
        expect(result[15]).toBe(100);
    });

    it('handles constant downtrend correctly (avgGain === 0)', () => {
        const closes = [25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
        const result = calculateRSI(closes, 14);

        // Given constant downtrend, avgGain is 0, rs is 0, RSI should be 0
        expect(result[14]).toBe(0);
        expect(result[15]).toBe(0);
    });

    it('calculates RSI values correctly for a mixed trend', () => {
        const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00];
        const result = calculateRSI(closes, 14);

        // Calculation:
        // Gains and Losses from index 1 to 14 (14 items):
        // 44.09 - 44.34 = -0.25 -> Gain: 0, Loss: 0.25
        // 44.15 - 44.09 = 0.06 -> Gain: 0.06, Loss: 0
        // 43.61 - 44.15 = -0.54 -> Gain: 0, Loss: 0.54
        // 44.33 - 43.61 = 0.72 -> Gain: 0.72, Loss: 0
        // 44.83 - 44.33 = 0.50 -> Gain: 0.50, Loss: 0
        // 45.10 - 44.83 = 0.27 -> Gain: 0.27, Loss: 0
        // 45.42 - 45.10 = 0.32 -> Gain: 0.32, Loss: 0
        // 45.84 - 45.42 = 0.42 -> Gain: 0.42, Loss: 0
        // 46.08 - 45.84 = 0.24 -> Gain: 0.24, Loss: 0
        // 45.89 - 46.08 = -0.19 -> Gain: 0, Loss: 0.19
        // 46.03 - 45.89 = 0.14 -> Gain: 0.14, Loss: 0
        // 45.61 - 46.03 = -0.42 -> Gain: 0, Loss: 0.42
        // 46.28 - 45.61 = 0.67 -> Gain: 0.67, Loss: 0
        // 46.28 - 46.28 = 0.00 -> Gain: 0, Loss: 0

        // Total gains = 0.06+0.72+0.50+0.27+0.32+0.42+0.24+0.14+0.67+0 = 3.34
        // Avg Gain = 3.34 / 14 = 0.23857...
        // Total losses = 0.25+0.54+0.19+0.42 = 1.4
        // Avg Loss = 1.4 / 14 = 0.1
        // RS = AvgGain / AvgLoss = 2.3857...
        // RSI = 100 - (100 / (1 + 2.3857)) = 70.46...

        expect(result[14]).toBeCloseTo(70.464, 2);

        // RMA for index 15:
        // 46.00 - 46.28 = -0.28 -> Gain: 0, Loss: 0.28
        // Avg Gain = (0.23857 * 13 + 0) / 14 = 0.22153...
        // Avg Loss = (0.1 * 13 + 0.28) / 14 = 0.11285...
        // RS = AvgGain / AvgLoss = 1.963...
        // RSI = 100 - (100 / (1 + 1.963)) = 66.249...

        expect(result[15]).toBeCloseTo(66.249, 2);
    });
});
