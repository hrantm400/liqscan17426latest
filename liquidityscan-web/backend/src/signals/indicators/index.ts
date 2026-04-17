/**
 * Barrel: indicator math and detectors (pure functions, no I/O).
 */
export type {
    CandleData,
    CISD_MSS_TYPE,
    CISDSignal,
    CRTSignal,
    ICTBiasSignal,
    RSIDivergenceConfig,
    RSIDivergenceSignal,
    SuperEngulfingSignal,
} from './candle-types';

export { calculateRSI } from './rsi-math';
export { detectRSIDivergence } from './rsi-divergence.detect';
export { calculateATR, detectSuperEngulfing } from './super-engulfing.detect';
export { detectICTBias } from './ict-bias.detect';
export { detectCRT } from './crt.detect';
export { detectCISD, detectAllCISDHistorical, detectAllMSS } from './cisd.detect';
export { detect3OB } from './3ob.detect';
export type { ThreeOBSignal } from './3ob.detect';
