import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFloatingChartStore } from '../../store/floatingChartStore';
import { FloatingChart } from './FloatingChart';

export const FloatingChartManager: React.FC = () => {
    const { activeCharts, reorganizeCharts, clearCharts, minimizeAllCharts } = useFloatingChartStore();

    if (activeCharts.length === 0) return null;

    return (
        <div className="hidden md:block fixed inset-0 pointer-events-none z-[89]">
            {/* Global Toolbar for Floating Charts */}
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-auto flex items-center gap-2 px-4 py-2 backdrop-blur-xl border rounded-full
                  dark:bg-[#0c1010]/80 dark:border-white/10 dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)]
                  light:bg-white/90 light:border-slate-200 light:shadow-lg"
            >
                <div className="flex items-center gap-1 pr-3 border-r dark:border-white/10 light:border-slate-200">
                    <span className="material-symbols-outlined text-primary text-xl">analytics</span>
                    <span className="text-[10px] font-black uppercase tracking-tighter dark:text-white light:text-slate-900">
                        Charts ({activeCharts.length})
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    <button 
                        onClick={() => reorganizeCharts('tile')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all group
                          dark:hover:bg-white/10 dark:text-gray-300 dark:hover:text-white
                          light:hover:bg-slate-100 light:text-slate-600 light:hover:text-slate-900"
                        title="Display in Grid"
                    >
                        <span className="material-symbols-outlined text-[18px]">grid_view</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider">Tile</span>
                    </button>
                    
                    <button 
                        onClick={() => reorganizeCharts('stack')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all group
                          dark:hover:bg-white/10 dark:text-gray-300 dark:hover:text-white
                          light:hover:bg-slate-100 light:text-slate-600 light:hover:text-slate-900"
                        title="Display as Stack"
                    >
                        <span className="material-symbols-outlined text-[18px]">layers</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider">Stack</span>
                    </button>

                    <button 
                        onClick={() => minimizeAllCharts()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all group
                          dark:hover:bg-white/10 dark:text-gray-300 dark:hover:text-white
                          light:hover:bg-slate-100 light:text-slate-600 light:hover:text-slate-900"
                        title="Minimize all charts"
                    >
                        <span className="material-symbols-outlined text-[18px]">collapse_all</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider">Minimize all</span>
                    </button>

                    <div className="w-px h-4 mx-1 dark:bg-white/10 light:bg-slate-200"></div>

                    <button 
                        onClick={() => clearCharts()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all group
                          dark:hover:bg-red-500/20 dark:text-gray-400 dark:hover:text-red-400
                          light:hover:bg-red-50 light:text-slate-600 light:hover:text-red-600"
                        title="Close All Charts"
                    >
                        <span className="material-symbols-outlined text-[18px]">close_all</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider">Clear</span>
                    </button>
                </div>
            </motion.div>

            <AnimatePresence>
                {activeCharts.map((chart) => (
                    <FloatingChart 
                        key={chart.id} 
                        chartData={chart} 
                    />
                ))}
            </AnimatePresence>
        </div>
    );
};
