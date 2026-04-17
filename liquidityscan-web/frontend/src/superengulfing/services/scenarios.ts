import { Candle } from '../types';

export type ScenarioType = 'RUN' | 'REV' | 'X';

export const generateScenario = (
  type: ScenarioType,
  isPlus: boolean,
  isBull: boolean,
  xParam: number
): Candle[] => {
  const candles: Candle[] = [];
  const now = Date.now();
  let idCounter = 0;
  
  // Helper to add candle
  const add = (open: number, close: number, high: number, low: number) => {
    candles.push({
      id: idCounter++,
      open: Number(open.toFixed(2)),
      close: Number(close.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      timestamp: now + idCounter * 60000
    });
  };

  // 1. Setup Phase (Context)
  // We need about 8-10 candles of context.
  let currentPrice = 100;
  
  // Determine trend direction for context
  // RUN Bull -> Needs Bull Trend context (Continuation)
  // REV Bull -> Needs Bear Trend context (Reversal)
  const trendDir = (type === 'RUN' && isBull) || (type === 'REV' && !isBull) ? 1 : -1;
  
  // For X Logic, we need to build "staircase liquidity"
  // Bull X: We need a series of Higher Lows (so the sweep can take them all out) OR just lows that can be swept.
  // Actually, to sweep 3 lows, the current low must be lower than low[1], low[2], low[3].
  
  const contextCount = Math.max(8, xParam + 2);

  for(let i=0; i<contextCount; i++) {
    
    // Default random logic
    const open = currentPrice;
    let dir = trendDir === 1 ? 1 : -1;
    let volatility = 1.0;
    
    // SPECIFIC SETUP FOR X LOGIC
    if (type === 'X') {
        // If we want a Bull X (Green candle sweeping Lows), 
        // we need the previous candles to have lows that are somewhat high, so we can sweep them.
        // Let's create a tight range or a slow trend up (for bull sweep) or down (for bear sweep)
        // so the sweep candle is dramatic.
        
        if (isBull) {
             // Creating higher lows or a range
             dir = 0.5; // Slow grind up
        } else {
             // Bear: Creating lower highs
             dir = -0.5; // Slow grind down
        }
        volatility = 0.5;
    }

    let close = open + (dir * Math.random() * 1.5 * volatility) + (Math.random() - 0.5);
    
    // Enforce structure for X logic immediately before the trigger
    // If we are N candles away from end, and need to set up X candles to be swept.
    const distFromEnd = contextCount - i;
    if (type === 'X' && distFromEnd <= xParam + 1) {
         // Fine tune the lows/highs
         if (isBull) {
             // Ensure lows are progressively higher or flat so the sweep is clean
             // Actually, just ensuring they are above a certain "Kill Zone"
             if (close < open) close = open + 0.1; // Make green-ish
         } else {
             if (close > open) close = open - 0.1; // Make red-ish
         }
    }

    const high = Math.max(open, close) + Math.random() * 0.5;
    const low = Math.min(open, close) - Math.random() * 0.5;
    
    add(open, close, high, low);
    currentPrice = close;
  }

  // 2. The Trigger Candle (The X-SE Candle)
  // It must be Green (if Bull) or Red (if Bear)
  // It must Sweep X previous candles.
  
  const lastC = candles[candles.length - 1];
  const tOpen = lastC.close;
  
  let targetLow = Infinity; // For Bull Sweep
  let targetHigh = -Infinity; // For Bear Sweep
  
  // Find the extreme of the last X candles
  for(let k=1; k<=xParam; k++) {
      const c = candles[candles.length - k];
      if (c) {
          if (c.low < targetLow) targetLow = c.low;
          if (c.high > targetHigh) targetHigh = c.high;
      }
  }

  let tClose = tOpen;
  let tHigh = tOpen;
  let tLow = tOpen;

  if (type === 'X') {
      if (isBull) {
          // BULL X: Green Candle, Low < targetLow
          tLow = targetLow - 0.5; // The SWEEP
          tClose = tOpen + 2.0; // Strong Close (Green)
          // Ensure it's green
          if (tClose <= tOpen) tClose = tOpen + 0.5;
          tHigh = Math.max(tClose, tOpen) + 0.2;
      } else {
          // BEAR X: Red Candle, High > targetHigh
          tHigh = targetHigh + 0.5; // The SWEEP
          tClose = tOpen - 2.0; // Strong Close (Red)
          if (tClose >= tOpen) tClose = tOpen - 0.5;
          tLow = Math.min(tClose, tOpen) - 0.2;
      }
  } 
  
  // RUN / REV Logic (Standard)
  else {
      // Setup candle (Previous)
      // Modify last added candle to ensure setup is perfect
      const prev = candles[candles.length - 1];
      
      // Update Prev Candle to facilitate the pattern
      if (type === 'RUN') {
          // Continuation needs prev to be same color
          // We assume the loop naturally created trend, but let's force the last one
      } else if (type === 'REV') {
          // Reversal needs prev to be opposite color
           const newPrevOpen = prev.close;
           const newPrevClose = isBull ? newPrevOpen - 1 : newPrevOpen + 1; // Opposite of target
           prev.open = newPrevOpen;
           prev.close = newPrevClose;
           prev.high = Math.max(newPrevOpen, newPrevClose) + 0.2;
           prev.low = Math.min(newPrevOpen, newPrevClose) - 0.2;
           // Recalc tOpen
      }
      
      const setupCandle = candles[candles.length - 1];
      const startPrice = setupCandle.close;

      if (isBull) {
         tLow = setupCandle.low - 0.5; // Sweep 1
         
         if (isPlus) tClose = setupCandle.high + 0.5;
         else if (type === 'REV') tClose = setupCandle.open + 0.2;
         else tClose = setupCandle.close + 0.5;
         
         tHigh = Math.max(tClose, startPrice) + 0.2;
      } else {
         tHigh = setupCandle.high + 0.5; // Sweep 1
         
         if (isPlus) tClose = setupCandle.low - 0.5;
         else if (type === 'REV') tClose = setupCandle.open - 0.2;
         else tClose = setupCandle.close - 0.5;
         
         tLow = Math.min(tClose, startPrice) - 0.2;
      }
      
      // Re-assign tOpen to match gapless
      add(setupCandle.close, tClose, tHigh, tLow);
      return candles;
  }

  add(tOpen, tClose, tHigh, tLow);

  // 3. Follow through
  let last = candles[candles.length-1];
  for(let i=0; i<2; i++) {
     const dir = isBull ? 1 : -1;
     const o = last.close;
     const c = o + (dir * 0.8);
     add(o, c, Math.max(o,c)+0.2, Math.min(o,c)-0.2);
     last = candles[candles.length-1];
  }
  
  return candles;
};
