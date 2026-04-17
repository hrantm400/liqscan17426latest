import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Candle, PatternResult } from '../superengulfing/types';
import { analyzeCandles } from '../superengulfing/services/logic';
import { generateScenario, ScenarioType } from '../superengulfing/services/scenarios';
import { CandleVisualizer } from '../superengulfing/components/CandleVisualizer';
import { StrategyBuilder } from '../superengulfing/components/StrategyBuilder';
import { QuizInterface } from '../superengulfing/components/QuizInterface';
import { BookOpen, BarChart2, Activity, Shuffle, Zap, GraduationCap, ChevronLeft } from 'lucide-react';
import { playSound } from '../superengulfing/services/audio';
import { useTheme } from '../contexts/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';

export const SuperEngulfing: React.FC = () => {
  const { theme } = useTheme();
  const [candles, setCandles] = useState<Candle[]>([]);
  const [patterns, setPatterns] = useState<(PatternResult | null)[]>([]);
  const [xParam, setXParam] = useState(3);
  const [mode, setMode] = useState<'playground' | 'learn' | 'quiz'>('playground');

  // Animation State
  const [scenarioData, setScenarioData] = useState<Candle[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState<number | null>(null);

  // Quiz State
  const [quizScore, setQuizScore] = useState(0);
  const [quizTotal, setQuizTotal] = useState(0);
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [quizCorrectAnswer, setQuizCorrectAnswer] = useState<string | null>(null);
  const [quizSelectedAnswer, setQuizSelectedAnswer] = useState<string | null>(null);

  // --- Random Data Generator ---
  const generateRandomData = useCallback(() => {
    setPlaybackIndex(null);
    setScenarioData([]);

    const newData: Candle[] = [];
    let price = 100;
    const now = Date.now();

    for (let i = 0; i < 24; i++) {
      const volatility = Math.random() * 4;
      const isGreen = Math.random() > 0.5;
      
      let open = price;
      if (Math.random() > 0.8) open += (Math.random() - 0.5) * 2;
      let close = isGreen ? open + Math.random() * volatility : open - Math.random() * volatility;
      
      let high = Math.max(open, close) + Math.random() * (volatility / 2);
      let low = Math.min(open, close) - Math.random() * (volatility / 2);

      const candle: Candle = {
        id: i,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        timestamp: now + i * 60000
      };

      newData.push(candle);
      price = close;
    }
    setCandles(newData);
  }, []);

  // --- Quiz Generator ---
  const startNextQuizQuestion = useCallback(() => {
      // 1. Reset Quiz State for new question
      setQuizSelectedAnswer(null);
      setPlaybackIndex(null);

      // 2. Randomly select parameters
      const types: ScenarioType[] = ['RUN', 'REV', 'X'];
      const randomType = types[Math.floor(Math.random() * types.length)];
      const isPlus = Math.random() > 0.5;
      const isBull = Math.random() > 0.5;
      const randomX = Math.floor(Math.random() * 3) + 2; // 2 to 4

      setXParam(randomX); // Sync X logic so analyzer works

      // 3. Generate Scenario Data
      const data = generateScenario(randomType, isPlus, isBull, randomX);
      setCandles(data); // Show full data immediately for quiz

      // 4. Determine Correct Answer
      // Analyze the LAST candle to find the pattern
      const results = data.map((_, i) => analyzeCandles(data, i, randomX));
      const lastResult = results[results.length - 1];
      
      if (!lastResult) {
          // Retry if RNG failed to produce a valid pattern (edge case)
          startNextQuizQuestion();
          return;
      }

      const correctAnswer = lastResult.label;
      setQuizCorrectAnswer(correctAnswer);

      // 5. Generate Distractors (Wrong Answers)
      const allPossibleAnswers = [
          'RUN Bull', 'RUN Bear', 'RUN+ Bull', 'RUN+ Bear',
          'REV Bull', 'REV Bear', 'REV+ Bull', 'REV+ Bear',
          `SE x${randomX}`, `SE x${randomX+1}`,
          `RUN Bull (x${randomX})`, `REV Bear (x${randomX})` 
      ];

      // Filter out correct answer and duplicates
      let distractors = allPossibleAnswers.filter(a => a !== correctAnswer);
      
      // Shuffle and pick 3
      distractors = distractors.sort(() => 0.5 - Math.random()).slice(0, 3);
      
      const options = [...distractors, correctAnswer].sort(() => 0.5 - Math.random());
      setQuizOptions(options);

  }, []);

  // --- Play Specific Scenario ---
  const handlePlayScenario = (type: ScenarioType, isPlus: boolean, isBull: boolean) => {
      const data = generateScenario(type, isPlus, isBull, xParam);
      setScenarioData(data);
      setCandles([]);
      setPlaybackIndex(0);
  };

  // --- Animation Loop ---
  useEffect(() => {
    if (playbackIndex !== null && playbackIndex < scenarioData.length) {
        const timer = setTimeout(() => {
            setCandles(prev => [...prev, scenarioData[playbackIndex]]);
            setPlaybackIndex(prev => prev! + 1);
            playSound('tick'); 
        }, 150);
        return () => clearTimeout(timer);
    } else if (playbackIndex === scenarioData.length) {
        setPlaybackIndex(null);
    }
  }, [playbackIndex, scenarioData]);

  // --- Initial Load ---
  useEffect(() => {
    generateRandomData();
  }, [generateRandomData]);

  // --- Analysis & Audio Feedback ---
  useEffect(() => {
    if (candles.length === 0) {
        setPatterns([]);
        return;
    }
    const results = candles.map((_, index) => analyzeCandles(candles, index, xParam));
    setPatterns(results);

    // Audio triggers only in Playground mode during animation
    if (mode === 'playground' && playbackIndex !== null) {
        const lastResult = results[results.length - 1];
        if (lastResult) {
             if (lastResult.label.includes('Bull')) playSound('bull');
             else playSound('bear');
        }
    }
  }, [candles, xParam, playbackIndex, mode]);

  const latestPattern = patterns.length > 0 ? patterns[patterns.length - 1] : null;

  // Mode Switching Handlers
  const handleModeChange = (newMode: 'playground' | 'learn' | 'quiz') => {
      playSound('click');
      setMode(newMode);
      if (newMode === 'quiz') {
          setQuizScore(0);
          setQuizTotal(0);
          startNextQuizQuestion();
      } else {
          generateRandomData();
      }
  };

  return (
    <div className="min-h-screen font-sans selection:bg-primary selection:text-black dark:bg-background-dark dark:text-white light:bg-background-light light:text-text-dark relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none z-0 dark:bg-cinematic-gradient light:bg-cinematic-gradient-light" />
      <div className="fixed top-[-20%] right-[-10%] w-[800px] h-[800px] dark:bg-primary/5 light:bg-primary/[0.06] rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-20%] left-[-10%] w-[600px] h-[600px] dark:bg-primary/[0.03] light:bg-primary/[0.04] rounded-full blur-[100px] pointer-events-none z-0" />
      
      {/* Header */}
      <header className="relative z-20 border-b dark:border-white/5 light:border-green-200/40 dark:bg-surface-dark/85 light:bg-white/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between xl:gap-6">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                <Link
                    to="/tools"
                    className="flex items-center gap-1 shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium dark:text-slate-400 light:text-slate-600 hover:text-primary transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" aria-hidden />
                    <span className="hidden sm:inline">Tools</span>
                </Link>
                <div className="relative group cursor-default shrink-0">
                    <div className="absolute inset-0 bg-primary rounded-xl blur opacity-[0.12] dark:opacity-20 group-hover:opacity-[0.18] dark:group-hover:opacity-30 transition-opacity" />
                    <div className="relative w-10 h-10 dark:bg-surface-dark light:bg-white rounded-xl border dark:border-white/10 light:border-green-200/80 flex items-center justify-center shadow-sm">
                        <BarChart2 size={22} className="text-primary" />
                    </div>
                </div>
                <div className="min-w-0">
                    <h1 className="text-lg sm:text-xl font-semibold tracking-tight dark:text-white light:text-text-dark truncate">
                        Pattern lab · <span className="text-primary">Super Engulfing</span>
                    </h1>
                    <p className="text-[11px] sm:text-xs dark:text-slate-400 light:text-slate-600 mt-0.5">
                        Train recognition on scripted candles
                    </p>
                </div>
            </div>
            
            <nav className="flex flex-wrap items-center justify-center xl:justify-end gap-1 p-1 rounded-xl dark:bg-surface-dark/50 light:bg-slate-100/90 border dark:border-white/5 light:border-green-200/60 min-w-0 w-full xl:w-auto">
                <button 
                    type="button"
                    onClick={() => handleModeChange('playground')}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${mode === 'playground' ? 'bg-primary text-black shadow-md shadow-[0_0_20px_rgba(19,236,55,0.25)]' : 'dark:text-slate-400 light:text-slate-600 dark:hover:text-white light:hover:text-text-dark dark:hover:bg-white/5 light:hover:bg-white/80'}`}
                >
                    Playground
                </button>
                 <button 
                    type="button"
                    onClick={() => handleModeChange('quiz')}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 ${mode === 'quiz' ? 'bg-primary/90 text-black shadow-md shadow-[0_0_20px_rgba(19,236,55,0.2)]' : 'dark:text-slate-400 light:text-slate-600 dark:hover:text-white light:hover:text-text-dark dark:hover:bg-white/5 light:hover:bg-white/80'}`}
                >
                    <GraduationCap size={16} className="shrink-0" aria-hidden />
                    <span>Quiz</span>
                </button>
                <button 
                    type="button"
                    onClick={() => handleModeChange('learn')}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${mode === 'learn' ? 'bg-primary text-black shadow-md shadow-[0_0_20px_rgba(19,236,55,0.25)]' : 'dark:text-slate-400 light:text-slate-600 dark:hover:text-white light:hover:text-text-dark dark:hover:bg-white/5 light:hover:bg-white/80'}`}
                >
                    Learn
                </button>
            </nav>
            <div className="flex justify-center xl:justify-end shrink-0">
                <ThemeToggle isPinned={false} />
            </div>
        </div>
      </header>

      <main className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        
        {/* Layout for Playground AND Quiz */}
        {(mode === 'playground' || mode === 'quiz') && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Main Chart Area */}
                <div className="lg:col-span-8 space-y-6">
                    <div className={`glass-panel rounded-2xl p-1 shadow-xl relative group overflow-hidden border dark:border-white/5 light:border-green-200/60 border-t ${mode === 'quiz' ? 'border-primary/30' : 'border-primary/15'}`}>
                        {/* Chart chrome */}
                        <div className="absolute top-0 left-0 right-0 min-h-14 dark:bg-surface-dark/70 light:bg-white/80 backdrop-blur border-b dark:border-white/5 light:border-green-200/50 flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3 z-10">
                             <div className="flex items-center gap-4 sm:gap-6">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] uppercase tracking-wider dark:text-slate-500 light:text-slate-500">Pair</span>
                                    <span className="text-sm font-semibold dark:text-white light:text-text-dark tabular-nums">BTC/USD</span>
                                </div>
                                <div className="h-8 w-px dark:bg-white/10 light:bg-slate-200" />
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] uppercase tracking-wider dark:text-slate-500 light:text-slate-500">Interval</span>
                                    <span className="text-sm font-semibold text-primary tabular-nums">5m</span>
                                </div>
                             </div>
                             
                             {mode === 'quiz' && (
                                 <div className="bg-primary/10 border border-primary/25 px-3 py-1 rounded-lg text-xs font-medium text-primary">
                                     Quiz in progress
                                 </div>
                             )}

                             {playbackIndex !== null && mode === 'playground' && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/25 rounded-full">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                                    </span>
                                    <span className="text-xs font-semibold text-primary">Playing scenario</span>
                                </div>
                             )}
                        </div>

                        <div className="h-[550px] w-full pt-[4.5rem] pb-4 px-2 sm:px-4 dark:bg-gradient-to-b dark:from-surface-dark/35 dark:to-transparent light:bg-gradient-to-b light:from-slate-50/50 light:to-transparent">
                            <CandleVisualizer 
                                candles={candles} 
                                patterns={patterns} 
                                width={1000} 
                                height={550}
                                colorMode={theme}
                                hideLabels={mode === 'quiz' && quizSelectedAnswer === null}
                            />
                        </div>
                    </div>
                    
                    {/* Pattern Counts (Hidden in Quiz) */}
                    {mode === 'playground' && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                            {['RUN', 'RUN+', 'REV', 'REV+'].map((type) => (
                                <div key={type} className="glass-panel rounded-xl p-4 flex flex-col items-center justify-center border dark:border-white/5 light:border-green-200/50 hover:border-primary/25 transition-colors">
                                    <span className="text-[11px] dark:text-slate-500 light:text-slate-600 font-medium mb-1">{type}</span>
                                    <span className="text-xl font-semibold tabular-nums dark:text-white light:text-text-dark">
                                        {patterns.filter(p => p?.label.includes(type) && !p?.label.includes('x')).length}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Sidebar Controls */}
                <div className="lg:col-span-4 space-y-6">
                    
                    {mode === 'playground' ? (
                        <>
                            {/* Signal Status Box */}
                            <div className="glass-panel p-6 rounded-2xl border dark:border-white/5 light:border-green-200/50 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-transparent via-primary to-transparent opacity-50" />
                                <h3 className="text-sm font-semibold dark:text-slate-300 light:text-slate-700 mb-4 flex items-center gap-2">
                                    <Activity size={16} className="text-primary shrink-0" aria-hidden />
                                    Last candle
                                </h3>
                                
                                {latestPattern ? (
                                    <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className={`text-xs px-2 py-1 rounded font-bold font-mono tracking-wide ${latestPattern.label.includes('Bull') ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                                {latestPattern.strength.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight break-words ${latestPattern.label.includes('Bull') ? 'text-primary' : 'text-red-400'}`}>
                                            {latestPattern.label}
                                        </div>
                                        <div className="mt-4 pt-4 border-t dark:border-white/5 light:border-slate-200 text-sm dark:text-slate-400 light:text-slate-600 leading-relaxed">
                                            {latestPattern.type.includes('RUN') && "Market structure maintained. Liquidity grab successful, continuation likely."}
                                            {latestPattern.type.includes('REV') && "Trend reversal detected. Previous range engulfed. Prepare for shift."}
                                            {latestPattern.isPlus && <span className="block mt-2 text-primary font-bold">PLUS confirmed: Strong close beyond previous extreme.</span>}
                                            {latestPattern.xCount && <span className="block mt-2 text-primary/80 font-bold">X-FACTOR: Dominant engulfing of {latestPattern.xCount} candles.</span>}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center min-h-[5rem] text-sm dark:text-slate-500 light:text-slate-500 text-center px-2">
                                        No labeled pattern on the last candle yet. Run a scenario or randomize.
                                    </div>
                                )}
                            </div>

                            <StrategyBuilder 
                                onGenerate={generateRandomData}
                                onPlayScenario={handlePlayScenario}
                                xParam={xParam}
                                setXParam={setXParam}
                                latestPattern={latestPattern}
                            />
                        </>
                    ) : (
                        <QuizInterface 
                            options={quizOptions}
                            correctOption={quizCorrectAnswer}
                            selectedOption={quizSelectedAnswer}
                            score={quizScore}
                            totalQuestions={quizTotal}
                            onSelect={(opt) => {
                                setQuizSelectedAnswer(opt);
                                if(opt === quizCorrectAnswer) setQuizScore(s => s + 1);
                                setQuizTotal(t => t + 1);
                            }}
                            onNext={startNextQuizQuestion}
                        />
                    )}

                    {/* Quick Cheat Sheet */}
                    <div className="glass-panel p-5 rounded-2xl border dark:border-white/5 light:border-green-200/50">
                        <h4 className="flex items-center gap-2 text-sm font-semibold dark:text-slate-300 light:text-slate-700 mb-4">
                            <BookOpen size={16} className="text-primary shrink-0" aria-hidden />
                            Quick reference
                        </h4>
                        <ul className="space-y-3 text-xs dark:text-slate-400 light:text-slate-600">
                            <li className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-4">
                                <span className="font-mono font-semibold dark:text-slate-200 light:text-text-dark">RUN</span>
                                <span className="dark:text-slate-500 light:text-slate-500">Sweep low, close higher</span>
                            </li>
                            <li className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-4">
                                <span className="font-mono font-semibold dark:text-slate-200 light:text-text-dark">REV</span>
                                <span className="dark:text-slate-500 light:text-slate-500">Sweep low, engulf prior open</span>
                            </li>
                            <li className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-4">
                                <span className="font-mono font-semibold dark:text-slate-200 light:text-text-dark">Plus (+)</span>
                                <span className="dark:text-slate-500 light:text-slate-500">Close beyond previous extreme</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        )}

        {mode === 'learn' && (
            <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="text-center space-y-4 mb-12">
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight dark:text-white light:text-text-dark mb-2">
                        How the logic works
                    </h1>
                    <p className="dark:text-slate-400 light:text-slate-600 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
                        Super Engulfing highlights liquidity sweeps and strong closes so you can spot continuation and reversal setups faster.
                    </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="glass-panel p-8 rounded-3xl border dark:border-primary/25 light:border-green-200/80 relative overflow-hidden group hover:border-primary/40 transition-colors">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                            <Activity size={100} className="text-primary" aria-hidden />
                        </div>
                        <h3 className="text-2xl font-bold dark:text-white light:text-text-dark mb-2 font-mono">RUN</h3>
                        <span className="inline-block px-2 py-1 rounded-md bg-primary/15 text-primary text-[11px] font-semibold mb-6">Continuation</span>
                        <p className="dark:text-slate-400 light:text-slate-600 mb-6 leading-relaxed">
                            The trend pauses to grab liquidity. A candle sweeps the previous candle's low (in an uptrend) but refuses to reverse, closing higher than the previous close. This indicates trapped sellers.
                        </p>
                    </div>

                    <div className="glass-panel p-8 rounded-3xl border dark:border-primary/25 light:border-green-200/80 relative overflow-hidden group hover:border-primary/40 transition-colors">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                            <Shuffle size={100} className="text-primary" aria-hidden />
                        </div>
                        <h3 className="text-2xl font-bold dark:text-white light:text-text-dark mb-2 font-mono">REV</h3>
                        <span className="inline-block px-2 py-1 rounded-md bg-primary/15 text-primary text-[11px] font-semibold mb-6">Reversal</span>
                        <p className="dark:text-slate-400 light:text-slate-600 mb-6 leading-relaxed">
                            A hard reversal. The candle opens against the trend, sweeps liquidity, and then engulfs the previous candle's body completely. This signifies a total shift in market control.
                        </p>
                    </div>
                </div>

                <div className="glass-panel p-8 rounded-3xl border dark:border-white/5 light:border-green-200/60 relative overflow-hidden">
                     <div className="absolute inset-0 bg-grid-pattern opacity-[0.07] dark:opacity-10 pointer-events-none" />
                     <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                        <div className="flex-1">
                            <h2 className="text-xl md:text-2xl font-bold dark:text-white light:text-text-dark mb-4 font-mono">The <span className="text-primary">Plus (+)</span> filter</h2>
                            <p className="dark:text-slate-400 light:text-slate-600 leading-relaxed">
                                A regular tag is useful; <span className="dark:text-white light:text-text-dark font-semibold">Plus</span> means the candle closed beyond the last candle’s <span className="text-primary">wick extreme</span>, not only the body — so weaker reactions are filtered out.
                            </p>
                        </div>
                        <div className="w-full md:w-1/3 p-6 dark:bg-surface-dark/80 light:bg-white rounded-xl border dark:border-primary/20 light:border-green-200/80 text-center">
                            <Zap size={40} className="mx-auto text-primary mb-3" aria-hidden />
                            <div className="text-xs dark:text-slate-500 light:text-slate-500">Illustrative strength</div>
                            <div className="text-2xl font-bold text-primary tabular-nums">High</div>
                        </div>
                     </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
};
