import React from 'react';
import { ArrowRight, CheckCircle, XCircle, Trophy, BrainCircuit } from 'lucide-react';
import { playSound } from '../services/audio';

interface QuizInterfaceProps {
  options: string[];
  onSelect: (option: string) => void;
  selectedOption: string | null;
  correctOption: string | null;
  score: number;
  totalQuestions: number;
  onNext: () => void;
  className?: string;
}

export const QuizInterface: React.FC<QuizInterfaceProps> = ({
  options,
  onSelect,
  selectedOption,
  correctOption,
  score,
  totalQuestions,
  onNext,
  className
}) => {
  
  const handleSelect = (option: string) => {
    if (selectedOption) return; // Prevent changing answer
    onSelect(option);
    if (option === correctOption) {
        playSound('success');
    } else {
        playSound('error');
    }
  };

  const isAnswered = selectedOption !== null;

  return (
    <div className={`glass-panel p-6 rounded-2xl shadow-lg border dark:border-white/5 light:border-green-200/60 flex flex-col h-full justify-between ${className}`}>
      
      {/* Quiz Header */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2 min-w-0">
                <BrainCircuit className="text-primary shrink-0" size={22} aria-hidden />
                <h2 className="text-lg font-semibold dark:text-white light:text-text-dark tracking-tight truncate">
                    Pattern quiz
                </h2>
            </div>
            <div className="flex items-center gap-2 dark:bg-surface-dark/50 light:bg-white/80 px-3 py-1.5 rounded-full border dark:border-primary/20 light:border-green-200/80 shrink-0">
                <Trophy size={14} className="text-primary" aria-hidden />
                <span className="text-sm font-medium tabular-nums dark:text-white light:text-text-dark">{score}/{totalQuestions}</span>
            </div>
        </div>

        {/* Question Prompt */}
        <div className="mb-6">
            <p className="dark:text-slate-300 light:text-slate-600 text-sm leading-relaxed">
                Name the setup on the <span className="font-medium dark:text-white light:text-text-dark">last candle</span>.
            </p>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-1 gap-3">
            {options.map((option, idx) => {
                let btnClass = "dark:bg-surface-dark/50 light:bg-white/80 dark:border-white/10 light:border-slate-200 dark:hover:bg-surface-dark light:hover:bg-white hover:border-primary/40";
                let icon = <div className="w-5 h-5 rounded-full border border-gray-500 flex items-center justify-center text-[10px] dark:text-gray-400 light:text-slate-500">{String.fromCharCode(65+idx)}</div>;
                
                if (isAnswered) {
                    if (option === correctOption) {
                        btnClass = "bg-green-500/20 border-green-500 text-green-300 shadow-[0_0_15px_rgba(34,197,94,0.3)]";
                        icon = <CheckCircle size={20} className="text-green-400" />;
                    } else if (option === selectedOption && option !== correctOption) {
                        btnClass = "bg-red-500/20 border-red-500 text-red-300 opacity-80";
                        icon = <XCircle size={20} className="text-red-400" />;
                    } else {
                        btnClass = "opacity-40 border-transparent grayscale";
                    }
                }

                return (
                    <button
                        key={idx}
                        onClick={() => handleSelect(option)}
                        disabled={isAnswered}
                        className={`
                            relative w-full py-3.5 px-4 rounded-xl border-2 transition-all duration-200
                            flex items-center justify-between group
                            text-left font-mono font-semibold text-sm dark:text-white light:text-text-dark
                            ${btnClass}
                        `}
                    >
                        <span>{option}</span>
                        {icon}
                    </button>
                );
            })}
        </div>
      </div>

      {/* Footer / Next Button */}
      <div className="mt-8">
        {isAnswered ? (
            <button 
                type="button"
                onClick={onNext}
                className="w-full py-3 bg-primary hover:bg-primary-hover text-black rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-[0_0_20px_rgba(19,236,55,0.35)] transition-all animate-in fade-in slide-in-from-bottom-2"
            >
                <span>Next question</span>
                <ArrowRight size={16} aria-hidden />
            </button>
        ) : (
            <div className="w-full py-3 text-center dark:text-slate-500 light:text-slate-500 text-xs font-medium animate-pulse">
                Tap an answer
            </div>
        )}
      </div>
    </div>
  );
};
