const { describe, it } = require('node:test');
const assert = require('node:assert');
const { findPivotLows } = require('../indicators.js');

describe('findPivotLows', () => {
    it('should find a basic pivot low', () => {
        // A pivot low where the value is the minimum in window [i-5, i+5]
        const data = [10, 9, 8, 7, 6, 5, 6, 7, 8, 9, 10]; // length 11. Index 5 is 5.
        // lbL = 5, lbR = 5. Window sizes are 5.
        const expected = new Array(11).fill(false);
        expected[5] = true;

        const result = findPivotLows(data, 5, 5);
        assert.deepStrictEqual(result, expected);
    });

    it('should not find a pivot low if not the strict minimum on the left', () => {
        // Left side has a value equal to the pivot
        const data = [10, 9, 8, 7, 5, 5, 6, 7, 8, 9, 10]; // length 11. Index 5 is 5, but index 4 is also 5.
        const expected = new Array(11).fill(false);

        const result = findPivotLows(data, 5, 5);
        assert.deepStrictEqual(result, expected);
    });

    it('should not find a pivot low if not the strict minimum on the right', () => {
        // Right side has a value equal to the pivot
        const data = [10, 9, 8, 7, 6, 5, 5, 7, 8, 9, 10]; // length 11. Index 5 is 5, but index 6 is also 5.
        const expected = new Array(11).fill(false);

        const result = findPivotLows(data, 5, 5);
        assert.deepStrictEqual(result, expected);
    });

    it('should return all false for array smaller than lbL + lbR + 1', () => {
        const data = [5, 4, 3, 4, 5]; // length 5
        const expected = new Array(5).fill(false);
        const result = findPivotLows(data, 5, 5);
        assert.deepStrictEqual(result, expected);
    });

    it('should handle custom lbL and lbR values', () => {
        const data = [10, 5, 10]; // length 3. Index 1 is 5.
        const expected = new Array(3).fill(false);
        expected[1] = true;

        const result = findPivotLows(data, 1, 1);
        assert.deepStrictEqual(result, expected);
    });

    it('should handle NaN values appropriately', () => {
        // If pivot is NaN, it should be skipped
        const data1 = [10, 9, NaN, 7, 6, NaN, 6, 7, 8, 9, 10];
        const result1 = findPivotLows(data1, 5, 5);
        assert.strictEqual(result1[5], false);

        // If window contains NaN, the condition data[i-j] <= data[i] handles it or it breaks?
        // Let's check the code: if (isNaN(data[i - j]) || data[i - j] <= data[i]) { isPivot = false; break; }
        // So if window has NaN, it's not a pivot.
        const data2 = [10, 9, NaN, 7, 6, 5, 6, 7, 8, 9, 10];
        const result2 = findPivotLows(data2, 5, 5);
        assert.strictEqual(result2[5], false); // NaN at i-3 (index 2). 5 - 3 = 2.
    });

    it('should find multiple pivot lows', () => {
        const data = [
            5, 4, 3, 4, 5, // index 2 is pivot (lb=2)
            6,
            5, 2, 6, 7, 8  // index 7 is pivot (lb=2)
        ];
        const expected = new Array(data.length).fill(false);
        expected[2] = true;
        expected[7] = true;

        const result = findPivotLows(data, 2, 2);
        assert.deepStrictEqual(result, expected);
    });
});
