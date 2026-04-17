import React from 'react';
import { PatternResult } from '../types';
import { TrendingUp, TrendingDown, Shuffle, Zap, Activity } from 'lucide-react';
import { ScenarioType } from '../services/scenarios';
import { playSound } from '../services/audio';

interface StrategyBuilderProps {
  onGenerate: () => void;
  onPlayScenario: (type: ScenarioType, isPlus: boolean, isBull: boolean) => void;
  xParam: number;
  setXParam: (n: number) => void;
  latestPattern: PatternResult | null;
  className?: string;
}

export const StrategyBuilder: React.FC<StrategyBuilderProps> = ({
  onGenerate,
  onPlayScenario,
  xParam,
  setXParam,
  className
}) => {
  
  const handlePlay = (type: ScenarioType, isPlus: boolean, isBull: boolean) => {
    playSound('click');
    onPlayScenario(type, isPlus, isBull);
  };

  const handleGenerate = () => {
    playSound('click');
    onGenerate();
  }

  return (
    <div className={`glass-panel p-6 rounded-2xl shadow-lg backdrop-blur-xl border dark:border-white/5 light:border-green-200/60 relative overflow-hidden ${className}`}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/[0.06] rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-primary/[0.04] rounded-full blur-3xl -z-10 pointer-events-none" />

      <div className="flex items-center justify-between gap-3 mb-8 border-b dark:border-white/5 light:border-slate-200/80 pb-4">
        <div className="flex items-center gap-2 min-w-0">
            <Activity className="text-primary shrink-0" size={20} aria-hidden />
            <h2 className="text-base font-semibold dark:text-white light:text-text-dark tracking-tight truncate">
            Scenarios
            </h2>
        </div>
        <button 
            type="button"
            onClick={handleGenerate}
            onMouseEnter={() => playSound('hover')}
            className="group flex items-center gap-2 px-3 py-2 rounded-lg dark:bg-surface-dark/50 light:bg-white/80 dark:text-slate-300 light:text-slate-700 text-xs font-medium border dark:border-white/10 light:border-green-200/80 transition-all hover:border-primary/40 hover:shadow-[0_0_12px_rgba(19,236,55,0.25)] shrink-0"
        >
            <Shuffle size={14} className="group-hover:rotate-180 transition-transform duration-500" aria-hidden />
            <span>New random</span>
        </button>
      </div>

      <div className="space-y-8">
        
        {/* Logic Sections */}
        {['RUN', 'REV'].map((strategy) => (
             <div key={strategy} className="space-y-3">
                <h3 className="text-[11px] font-semibold dark:text-slate-400 light:text-slate-600 flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${strategy === 'RUN' ? 'bg-primary shadow-[0_0_8px_rgba(19,236,55,0.5)]' : 'bg-primary/80 shadow-[0_0_8px_rgba(19,236,55,0.4)]'}`} />
                    {strategy === 'RUN' ? 'Continuation' : 'Reversal'} · {strategy}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    {/* Bull Buttons */}
                    <div className="flex flex-col space-y-2">
                        <ControlButton 
                            onClick={() => handlePlay(strategy as ScenarioType, false, true)}
                            label={strategy}
                            subLabel="BULL"
                            color="green"
                            icon={<TrendingUp size={14} />}
                        />
                         <ControlButton 
                            onClick={() => handlePlay(strategy as ScenarioType, true, true)}
                            label={`${strategy}+`}
                            subLabel="PLUS"
                            color="green-glow"
                            icon={<Zap size={14} />}
                        />
                    </div>
                    {/* Bear Buttons */}
                    <div className="flex flex-col space-y-2">
                        <ControlButton 
                            onClick={() => handlePlay(strategy as ScenarioType, false, false)}
                            label={strategy}
                            subLabel="BEAR"
                            color="red"
                            icon={<TrendingDown size={14} />}
                        />
                        <ControlButton 
                            onClick={() => handlePlay(strategy as ScenarioType, true, false)}
                            label={`${strategy}+`}
                            subLabel="PLUS"
                            color="red-glow"
                            icon={<Zap size={14} />}
                        />
                    </div>
                </div>
            </div>
        ))}

        {/* X Logic Section */}
         <div className="space-y-4 pt-6 border-t dark:border-white/5 light:border-slate-200/80">
             <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-semibold dark:text-slate-400 light:text-slate-600 flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(19,236,55,0.5)] shrink-0" />
                    X-factor depth
                </h3>
                 <span className="text-[11px] text-primary font-medium bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md tabular-nums shrink-0">
                    {xParam}
                </span>
            </div>
            
            <div className="relative group">
                 <input 
                    type="range" 
                    min="2" 
                    max="10" 
                    value={xParam} 
                    onChange={(e) => setXParam(parseInt(e.target.value))}
                    className="w-full h-2 dark:bg-surface-dark light:bg-white rounded-lg appearance-none cursor-pointer accent-primary"
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                 <ControlButton 
                    onClick={() => handlePlay('X', false, true)}
                    label="X"
                    subLabel="BULL"
                    color="purple"
                    icon={<TrendingUp size={14} />}
                />
                <ControlButton 
                    onClick={() => handlePlay('X', false, false)}
                    label="X"
                    subLabel="BEAR"
                    color="purple"
                    icon={<TrendingDown size={14} />}
                />
            </div>
        </div>
      </div>
    </div>
  );
};

// Reusable Fancy Button
const ControlButton: React.FC<{
    onClick: () => void;
    label: string;
    subLabel: string;
    icon: React.ReactNode;
    color: 'green' | 'red' | 'purple' | 'green-glow' | 'red-glow';
}> = ({ onClick, label, subLabel, icon, color }) => {
    
    const getColorClasses = () => {
        switch(color) {
            case 'green': return "border-primary/20 hover:border-primary/50 hover:bg-primary/10 text-primary";
            case 'green-glow': return "border-primary/40 bg-primary/5 hover:bg-primary/20 text-primary shadow-[0_0_10px_rgba(19,236,55,0.2)] hover:shadow-[0_0_15px_rgba(19,236,55,0.4)]";
            case 'red': return "border-red-500/20 hover:border-red-500/50 hover:bg-red-500/10 text-red-400";
            case 'red-glow': return "border-red-400/40 bg-red-500/5 hover:bg-red-500/20 text-red-300 shadow-[0_0_10px_rgba(248,113,113,0.1)] hover:shadow-[0_0_15px_rgba(248,113,113,0.3)]";
            case 'purple': return "border-primary/20 hover:border-primary/50 hover:bg-primary/10 text-primary";
            default: return "";
        }
    }

    return (
        <button 
            type="button"
            onClick={onClick}
            onMouseEnter={() => playSound('hover')}
            className={`
                group relative w-full py-3 px-4 rounded-lg border transition-all duration-300
                flex items-center justify-between overflow-hidden
                ${getColorClasses()}
            `}
        >
            <div className="flex flex-col items-start z-10 text-left">
                <span className="text-[10px] opacity-75 font-medium tracking-wide">{subLabel}</span>
                <span className="text-xs font-bold font-mono group-hover:scale-[1.02] transition-transform">{label}</span>
            </div>
            <div className="z-10 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                {icon}
            </div>
            
            {/* Hover Shine Effect */}
            <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 pointer-events-none" />
        </button>
    )
}
