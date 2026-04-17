import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FloatingChartData {
    id: string; // usually strategyType-symbol-timeframe
    /** When set, "open" navigates to /signals/:id (full signal page) */
    signalId?: string;
    symbol: string;
    strategyType: string;
    timeframe: string;
    isMinimized?: boolean;
    isTradingView?: boolean;
    // Position & Size Persistence
    x?: number;
    y?: number;
    w?: number;
    h?: number;
}

interface FloatingChartState {
    activeCharts: FloatingChartData[];
    addChart: (chart: FloatingChartData) => void;
    removeChart: (id: string) => void;
    clearCharts: () => void;
    toggleMinimizeChart: (id: string) => void;
    minimizeAllCharts: () => void;
    updateChartPosition: (id: string, x: number, y: number) => void;
    updateChartSize: (id: string, w: number, h: number) => void;
    updateChartType: (id: string, isTradingView: boolean) => void;
    reorganizeCharts: (mode: 'tile' | 'stack') => void;
}

const MAX_CHARTS = 7;
const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 340;

export const useFloatingChartStore = create<FloatingChartState>()(
    persist(
        (set, get) => ({
            activeCharts: [],
            
            addChart: (chart) => {
                const { activeCharts } = get();
                // Prevent duplicates
                if (activeCharts.some((c) => c.id === chart.id)) {
                    // If exists but is minimized, unminimize it; refresh signalId if provided
                    set((state) => ({
                        activeCharts: state.activeCharts.map((c) =>
                            c.id === chart.id
                                ? { ...c, isMinimized: false, signalId: chart.signalId ?? c.signalId }
                                : c,
                        ),
                    }));
                    return;
                }
                
                // Calculate initial position if not provided
                const offset = activeCharts.length * 40;
                const initialX = chart.x ?? window.innerWidth - 450 - offset;
                const initialY = chart.y ?? window.innerHeight - 380 - offset;

                // Add new chart to the front. If we exceed max, drop the oldest (last)
                const updated = [
                    { 
                        ...chart, 
                        isMinimized: false, 
                        isTradingView: chart.isTradingView ?? false,
                        x: initialX,
                        y: initialY,
                        w: chart.w ?? DEFAULT_WIDTH,
                        h: chart.h ?? DEFAULT_HEIGHT
                    }, 
                    ...activeCharts
                ].slice(0, MAX_CHARTS);
                set({ activeCharts: updated });
            },
            
            removeChart: (id) => {
                set((state) => ({
                    activeCharts: state.activeCharts.filter((c) => c.id !== id),
                }));
            },

            toggleMinimizeChart: (id) => {
                set((state) => ({
                    activeCharts: state.activeCharts.map((c) =>
                        c.id === id ? { ...c, isMinimized: !c.isMinimized } : c
                    ),
                }));
            },

            minimizeAllCharts: () => {
                const { activeCharts } = get();
                if (activeCharts.length === 0) return;

                // Layout minimized bubbles in a neat top row (wrap to next line if needed).
                const bubble = 56;
                const gap = 12;
                // Place bubbles near the very top (breadcrumb/navigation area).
                // Keep a small padding so they don't clip under the browser UI.
                const safeTop = 12;
                const sidebarWidth = 240;
                const safeLeft = sidebarWidth + 16;
                const safeRight = 16;
                const availableWidth = Math.max(0, window.innerWidth - safeLeft - safeRight);
                const perRow = Math.max(1, Math.floor((availableWidth + gap) / (bubble + gap)));
                const totalRowWidth = Math.min(activeCharts.length, perRow) * bubble + (Math.min(activeCharts.length, perRow) - 1) * gap;
                const startX = safeLeft + Math.max(0, Math.floor((availableWidth - totalRowWidth) / 2));
                const startY = safeTop;

                set(() => ({
                    activeCharts: activeCharts.map((c, index) => {
                        const row = Math.floor(index / perRow);
                        const col = index % perRow;
                        return {
                            ...c,
                            isMinimized: true,
                            x: startX + col * (bubble + gap),
                            y: startY + row * (bubble + gap),
                        };
                    }),
                }));
            },

            updateChartPosition: (id, x, y) => {
                set((state) => ({
                    activeCharts: state.activeCharts.map((c) =>
                        c.id === id ? { ...c, x, y } : c
                    ),
                }));
            },

            updateChartSize: (id, w, h) => {
                set((state) => ({
                    activeCharts: state.activeCharts.map((c) =>
                        c.id === id ? { ...c, w, h } : c
                    ),
                }));
            },

            updateChartType: (id, isTradingView) => {
                set((state) => ({
                    activeCharts: state.activeCharts.map((c) =>
                        c.id === id ? { ...c, isTradingView } : c
                    ),
                }));
            },

            reorganizeCharts: (mode) => {
                const { activeCharts } = get();
                if (activeCharts.length === 0) return;

                const margin = 20;
                const headerHeight = 60; // Offset for main page header
                const sidebarWidth = 240; // Offset for sidebar

                const updated = activeCharts.map((chart, index) => {
                    if (mode === 'tile') {
                        const cols = Math.ceil(Math.sqrt(activeCharts.length));
                        const col = index % cols;
                        const row = Math.floor(index / cols);
                        const w = (window.innerWidth - sidebarWidth - (cols + 1) * margin) / cols;
                        const h = (window.innerHeight - headerHeight - (Math.ceil(activeCharts.length / cols) + 1) * margin) / Math.ceil(activeCharts.length / cols);
                        
                        return {
                            ...chart,
                            x: sidebarWidth + margin + col * (w + margin),
                            y: headerHeight + margin + row * (h + margin),
                            w: Math.max(300, w),
                            h: Math.max(250, h),
                            isMinimized: false
                        };
                    } else {
                        // Stack / Cascade
                        return {
                            ...chart,
                            x: sidebarWidth + margin + index * 40,
                            y: headerHeight + margin + index * 40,
                            w: DEFAULT_WIDTH,
                            h: DEFAULT_HEIGHT,
                            isMinimized: false
                        };
                    }
                });

                set({ activeCharts: updated });
            },
            
            clearCharts: () => {
                set({ activeCharts: [] });
            },
        }),
        {
            name: 'floating-charts-storage',
            version: 2, // Increment version to clear incompatible states
        }
    )
);
