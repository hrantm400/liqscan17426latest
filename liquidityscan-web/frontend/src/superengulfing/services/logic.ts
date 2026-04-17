import { Candle, PatternType, PatternStrength, PatternResult } from '../types';

// --- HELPER FUNCTIONS ---
const isBull = (c: Candle) => c.close > c.open;
const isBear = (c: Candle) => c.close < c.open;

export const analyzeCandles = (candles: Candle[], currentIndex: number, xParam: number = 2): PatternResult | null => {
  if (currentIndex < 1) return null;

  const curr = candles[currentIndex];
  const prev = candles[currentIndex - 1];

  // Logic Basics
  const currBull = isBull(curr);
  const currBear = isBear(curr);
  const prevBull = isBull(prev);
  const prevBear = isBear(prev);

  // ==========================================
  // RUN PATTERN (Original: SE - Continuation)
  // ==========================================

  // Bullish RUN (Green -> Green)
  const run_bull_wick = curr.low < prev.low;       // Liquidity Grab (Low)
  const run_bull_close = curr.close > prev.close;   // Stronger Close
  const isRunBull = currBull && prevBull && run_bull_wick && run_bull_close;

  // Bearish RUN (Red -> Red)
  const run_bear_wick = curr.high > prev.high;     // Liquidity Grab (High)
  const run_bear_close = curr.close < prev.close;   // Weaker Close
  const isRunBear = currBear && prevBear && run_bear_wick && run_bear_close;

  // ==========================================
  // REV PATTERN (Original: CRT - Reversal)
  // ==========================================

  // Bullish REV (Red -> Green)
  const isRevBull = currBull && prevBear && curr.low < prev.low && curr.close > prev.open;

  // Bearish REV (Green -> Red)
  const isRevBear = currBear && prevBull && curr.high > prev.high && curr.close < prev.open;

  // ==========================================
  // THE "PLUS" LAYER
  // ==========================================
  const plus_bull_cond = curr.close > prev.high; // Closed above previous High
  const plus_bear_cond = curr.close < prev.low;  // Closed below previous Low

  let result: PatternResult | null = null;

  // Check Bullish Patterns
  if (isRunBull) {
    result = {
      type: PatternType.RUN_BULL,
      strength: plus_bull_cond ? PatternStrength.PLUS : PatternStrength.NORMAL,
      color: '#00E676',
      label: plus_bull_cond ? 'RUN+' : 'RUN',
      isPlus: plus_bull_cond
    };
  } else if (isRevBull) {
    result = {
      type: PatternType.REV_BULL,
      strength: plus_bull_cond ? PatternStrength.PLUS : PatternStrength.NORMAL,
      color: '#00ff00',
      label: plus_bull_cond ? 'REV+' : 'REV',
      isPlus: plus_bull_cond
    };
  } 
  // Check Bearish Patterns
  else if (isRunBear) {
    result = {
      type: PatternType.RUN_BEAR,
      strength: plus_bear_cond ? PatternStrength.PLUS : PatternStrength.NORMAL,
      color: '#FF1744',
      label: plus_bear_cond ? 'RUN+' : 'RUN',
      isPlus: plus_bear_cond
    };
  } else if (isRevBear) {
    result = {
      type: PatternType.REV_BEAR,
      strength: plus_bear_cond ? PatternStrength.PLUS : PatternStrength.NORMAL,
      color: '#ff0000',
      label: plus_bear_cond ? 'REV+' : 'REV',
      isPlus: plus_bear_cond
    };
  }

  // ==========================================
  // X LOGIC (SuperEngulfing Extension)
  // ==========================================
  // Logic: "Basically sweeping the lows or highs of the previous candles"
  
  // If no pattern detected yet, we can still detect a standalone X Sweep, 
  // but typically it enhances a RUN/REV. Let's allow it to upgrade existing patterns 
  // or define a standalone "Super Sweep".

  let xCount = 0;

  if (currBull) {
     // Check how many previous candles' LOWS did we sweep?
     // We look backwards. The moment a previous candle's low is LOWER than current low, the streak stops.
     // i.e. Current Low must be < Previous Low.
     
     for(let i = 1; i <= 20; i++) { // Check up to 20 candles back
        if (currentIndex - i < 0) break;
        const p = candles[currentIndex - i];
        
        if (curr.low < p.low) {
           xCount++;
        } else {
           break; // Sweep logic broken
        }
     }
  } else {
     // Bearish
     // Check how many previous candles' HIGHS did we sweep?
     // Current High must be > Previous High.
     
     for(let i = 1; i <= 20; i++) {
        if (currentIndex - i < 0) break;
        const p = candles[currentIndex - i];
        
        if (curr.high > p.high) {
           xCount++;
        } else {
           break; 
        }
     }
  }

  // Determine if X Logic is satisfied
  if (xCount >= xParam) {
      if (result) {
          // Upgrade existing pattern
          result.xCount = xCount;
          result.strength = PatternStrength.X_FACTOR;
          result.label = `${result.label} (x${xCount})`;
      } else {
          // Create standalone X Pattern if no RUN/REV but massive sweep
          // Usually needs a strong close to confirm (Green for Bull, Red for Bear)
          result = {
             type: currBull ? PatternType.RUN_BULL : PatternType.RUN_BEAR, // Defaulting to RUN type for visualization
             strength: PatternStrength.X_FACTOR,
             color: currBull ? '#d946ef' : '#d946ef', // Purple for X
             label: `SE x${xCount}`,
             isPlus: false,
             xCount: xCount
          };
      }
  }

  return result;
};
