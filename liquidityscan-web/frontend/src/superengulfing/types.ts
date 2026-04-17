export interface Candle {
  id: number;
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: number;
}

export enum PatternType {
  NONE = 'NONE',
  RUN_BULL = 'RUN Bull',
  RUN_BEAR = 'RUN Bear',
  REV_BULL = 'REV Bull',
  REV_BEAR = 'REV Bear',
}

export enum PatternStrength {
  NORMAL = 'Normal',
  PLUS = 'PLUS (+)',
  X_FACTOR = 'X-Factor',
}

export interface PatternResult {
  type: PatternType;
  strength: PatternStrength;
  xCount?: number; // For X Logic
  color: string;
  label: string;
  isPlus: boolean;
}

export interface SimulationConfig {
  volatility: number;
  trend: 'bull' | 'bear' | 'ranging';
}
