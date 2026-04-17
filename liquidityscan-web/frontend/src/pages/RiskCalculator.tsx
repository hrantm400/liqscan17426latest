import React, { useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { PageHeader } from '../components/layout/PageHeader';
import { scaleInVariants } from '../utils/animations';

function parseNum(raw: string): number {
  const n = parseFloat(String(raw).replace(/,/g, '').replace(/\s/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function fmtPositionSize(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

export const RiskCalculator: React.FC = () => {
  const [balanceStr, setBalanceStr] = useState('10000');
  const [risk, setRisk] = useState(1);
  const [entryStr, setEntryStr] = useState('64200');
  const [stopStr, setStopStr] = useState('64800');
  const [leverage, setLeverage] = useState(10);

  const balance = useMemo(() => parseNum(balanceStr), [balanceStr]);
  const entry = useMemo(() => parseNum(entryStr), [entryStr]);
  const stop = useMemo(() => parseNum(stopStr), [stopStr]);

  const derived = useMemo(() => {
    if (!Number.isFinite(balance) || balance <= 0) return null;
    if (!Number.isFinite(entry) || entry <= 0) return null;
    if (!Number.isFinite(stop) || stop <= 0) return null;
    if (entry === stop) return null;

    const riskUsd = balance * (risk / 100);
    const dist = Math.abs(entry - stop);
    const perUnitLoss = dist;
    const positionBase = riskUsd / perUnitLoss;
    const notional = positionBase * entry;
    const margin = leverage > 0 ? notional / leverage : notional;
    const side: 'long' | 'short' = stop < entry ? 'long' : 'short';
    const movePct = (dist / entry) * 100;

    return {
      riskUsd,
      positionBase,
      notional,
      margin,
      side,
      movePct,
      dist,
    };
  }, [balance, entry, stop, risk, leverage]);

  const onBalanceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setBalanceStr(e.target.value);
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="px-4 md:px-8 pt-4 md:pt-8 pb-2 shrink-0">
        <PageHeader
          breadcrumbs={[
            { label: 'Tools', path: '/tools' },
            { label: 'Risk calculator' },
          ]}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-8">
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-6">
          <p className="text-sm dark:text-gray-400 light:text-text-light-secondary leading-relaxed">
            Size a position from account balance, risk %, and entry vs stop. Estimates only — not financial advice.
          </p>

          <motion.div
            variants={scaleInVariants}
            initial="initial"
            animate="animate"
            className="glass-panel rounded-2xl border dark:border-white/10 light:border-green-200/80 overflow-hidden shadow-xl dark:shadow-none"
          >
            <div className="px-6 py-5 border-b dark:border-white/10 light:border-green-200/60 dark:bg-white/[0.02] light:bg-green-50/40">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-2xl">calculate</span>
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-tight dark:text-white light:text-text-dark">
                    Position sizing
                  </h1>
                  <p className="text-xs dark:text-gray-500 light:text-slate-500 mt-0.5">
                    Risk in USDT → size in coin & notional
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider dark:text-gray-500 light:text-slate-500">
                      Account (USDT)
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={balanceStr}
                      onChange={onBalanceChange}
                      className="glass-input rounded-xl py-3 px-4 dark:text-white light:text-text-dark font-mono text-sm border dark:border-white/10 light:border-green-200/80 focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider dark:text-gray-500 light:text-slate-500">
                      Risk per trade
                    </span>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0.1}
                        max={5}
                        step={0.1}
                        value={risk}
                        onChange={(e) => setRisk(parseFloat(e.target.value))}
                        className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <span className="text-sm font-mono font-bold text-primary w-14 text-right">{risk.toFixed(1)}%</span>
                    </div>
                    <span className="text-[11px] dark:text-gray-500 light:text-slate-500">
                      ≈ ${Number.isFinite(balance) ? fmtUsd(balance * (risk / 100)) : '—'} at risk
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider dark:text-gray-500 light:text-slate-500">
                      Entry price
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={entryStr}
                      onChange={(e) => setEntryStr(e.target.value)}
                      className="glass-input rounded-xl py-3 px-4 dark:text-white light:text-text-dark font-mono text-sm border dark:border-white/10 light:border-green-200/80 focus:ring-2 focus:ring-primary/30 outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider dark:text-gray-500 light:text-slate-500">
                      Stop loss
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={stopStr}
                      onChange={(e) => setStopStr(e.target.value)}
                      className="glass-input rounded-xl py-3 px-4 dark:text-white light:text-text-dark font-mono text-sm border dark:border-white/10 light:border-green-200/80 focus:ring-2 focus:ring-primary/30 outline-none"
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider dark:text-gray-500 light:text-slate-500">
                    Leverage (for margin estimate)
                  </span>
                  <div className="flex items-center gap-3 flex-wrap">
                    {[1, 2, 3, 5, 10, 20].map((lv) => (
                      <button
                        key={lv}
                        type="button"
                        onClick={() => setLeverage(lv)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          leverage === lv
                            ? 'bg-primary text-black border-primary shadow-[0_0_12px_rgba(19,236,55,0.35)]'
                            : 'dark:bg-white/5 light:bg-white dark:border-white/10 light:border-green-200/80 dark:text-gray-400 light:text-slate-600 hover:border-primary/50'
                        }`}
                      >
                        {lv}x
                      </button>
                    ))}
                  </div>
                </label>
              </div>

              <div className="flex flex-col gap-4">
                {!derived ? (
                  <div className="rounded-xl border border-dashed dark:border-white/15 light:border-green-300/60 p-8 text-center text-sm dark:text-gray-500 light:text-slate-500">
                    Enter balance, entry, and stop (entry ≠ stop) to see size.
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl p-6 border bg-gradient-to-br dark:from-[#152a18] dark:to-[#0a140d] dark:border-primary/20 light:from-green-50 light:to-white light:border-green-200/90 relative overflow-hidden"
                  >
                    <div className="absolute -right-16 -top-16 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="relative space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest dark:text-primary/80 light:text-emerald-700">
                          Implied direction
                        </span>
                        <span
                          className={`text-xs font-black px-2.5 py-1 rounded-full border ${
                            derived.side === 'long'
                              ? 'bg-primary/15 text-primary border-primary/30'
                              : 'bg-red-500/15 text-red-400 border-red-500/25'
                          }`}
                        >
                          {derived.side === 'long' ? 'LONG' : 'SHORT'}
                        </span>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider dark:text-gray-500 light:text-slate-500 mb-1">
                          Position size (coin)
                        </p>
                        <p className="text-3xl font-mono font-bold tracking-tight dark:text-white light:text-slate-900">
                          {fmtPositionSize(derived.positionBase)}
                          <span className="text-lg font-semibold dark:text-gray-400 light:text-slate-500 ml-2">units</span>
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t dark:border-white/10 light:border-green-200/80">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider dark:text-gray-500 light:text-slate-500 mb-0.5">
                            Notional
                          </p>
                          <p className="text-lg font-mono dark:text-white light:text-slate-900">${fmtUsd(derived.notional)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider dark:text-gray-500 light:text-slate-500 mb-0.5">
                            Margin ({leverage}x)
                          </p>
                          <p className="text-lg font-mono dark:text-white light:text-slate-900">${fmtUsd(derived.margin)}</p>
                        </div>
                      </div>
                      <div className="text-[11px] dark:text-gray-500 light:text-slate-600 font-mono">
                        Stop distance: {fmtUsd(derived.dist)} ({derived.movePct.toFixed(2)}% of entry)
                      </div>
                    </div>
                  </motion.div>
                )}

                <p className="text-[11px] leading-relaxed dark:text-gray-500 light:text-slate-500 border-t dark:border-white/10 light:border-green-200/60 pt-4">
                  Formula: position = (balance × risk%) ÷ |entry − stop|. Same idea for any pair priced in USDT; rename &ldquo;units&rdquo; to your base asset.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
