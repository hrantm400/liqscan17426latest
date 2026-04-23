import React, { useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PageHero } from '../components/shared/PageHero';

export const StrategyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  if (id === '1') {
    return <Navigate to="/strategies" replace />;
  }
  const strategyNum = id ? parseInt(id, 10) : 1;
  const [filter, setFilter] = useState<'all' | 'bullish' | 'bearish'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Mock data - will be replaced with real API calls later
  const mockSignals = [
    { coin: 'BTC', pair: 'BTC/USDT', exchange: 'Binance Perp', signalType: 'Breakout Long', confidence: 'HIGH', detected: '12:45:02', color: 'orange' },
    { coin: 'ETH', pair: 'ETH/USDT', exchange: 'Bybit Perp', signalType: 'Reversal Short', confidence: 'MEDIUM', detected: '12:32:15', color: 'purple' },
    { coin: 'SOL', pair: 'SOL/USDT', exchange: 'Coinbase', signalType: 'Rejection Short', confidence: 'HIGH', detected: '12:15:44', color: 'teal' },
    { coin: 'AVAX', pair: 'AVAX/USDT', exchange: 'Binance Perp', signalType: 'Pattern Long', confidence: 'MEDIUM', detected: '11:58:30', color: 'red' },
    { coin: 'MATIC', pair: 'MATIC/USDT', exchange: 'Bybit Perp', signalType: 'Breakout Long', confidence: 'LOW', detected: '11:45:12', color: 'blue' },
    { coin: 'LTC', pair: 'LTC/USDT', exchange: 'OKX Spot', signalType: 'Trend Pullback', confidence: 'HIGH', detected: '11:30:22', color: 'green' },
    { coin: 'DOGE', pair: 'DOGE/USDT', exchange: 'Binance Perp', signalType: 'Reversal Short', confidence: 'HIGH', detected: '11:15:10', color: 'pink' },
    { coin: 'XRP', pair: 'XRP/USDT', exchange: 'KuCoin', signalType: 'Rejection Short', confidence: 'MEDIUM', detected: '10:55:08', color: 'blue' },
    { coin: 'LINK', pair: 'LINK/USDT', exchange: 'Binance Spot', signalType: 'Volume Spike', confidence: 'HIGH', detected: '10:45:00', color: 'indigo' },
    { coin: 'BNB', pair: 'BNB/USDT', exchange: 'Binance Perp', signalType: 'Support Bounce', confidence: 'MEDIUM', detected: '10:32:15', color: 'yellow' },
    { coin: 'DOT', pair: 'DOT/USDT', exchange: 'Kraken', signalType: 'Pattern Short', confidence: 'LOW', detected: '10:15:30', color: 'rose' },
    { coin: 'FTM', pair: 'FTM/USDT', exchange: 'Bybit Spot', signalType: 'Trend Continuation', confidence: 'HIGH', detected: '09:58:12', color: 'cyan' },
    { coin: 'OP', pair: 'OP/USDT', exchange: 'Binance Perp', signalType: 'Breakout Short', confidence: 'HIGH', detected: '09:42:05', color: 'slate' },
    { coin: 'ARB', pair: 'ARB/USDT', exchange: 'OKX Perp', signalType: 'Reversal Long', confidence: 'MEDIUM', detected: '09:25:33', color: 'emerald' },
    { coin: 'SUI', pair: 'SUI/USDT', exchange: 'Bybit Perp', signalType: 'Momentum Long', confidence: 'HIGH', detected: '09:10:45', color: 'fuchsia' },
    { coin: 'ADA', pair: 'ADA/USDT', exchange: 'Binance Perp', signalType: 'Breakout Long', confidence: 'MEDIUM', detected: '08:55:12', color: 'blue' },
    { coin: 'SHIB', pair: 'SHIB/USDT', exchange: 'Coinbase', signalType: 'Volume Spike', confidence: 'HIGH', detected: '08:42:01', color: 'orange' },
    { coin: 'TRX', pair: 'TRX/USDT', exchange: 'OKX Perp', signalType: 'Trend Pullback', confidence: 'MEDIUM', detected: '08:30:45', color: 'red' },
    { coin: 'UNI', pair: 'UNI/USDT', exchange: 'Bybit Spot', signalType: 'Momentum Long', confidence: 'HIGH', detected: '08:15:33', color: 'pink' },
    { coin: 'ATOM', pair: 'ATOM/USDT', exchange: 'Binance Spot', signalType: 'Reversal Short', confidence: 'LOW', detected: '08:05:10', color: 'purple' },
    { coin: 'ETC', pair: 'ETC/USDT', exchange: 'Kraken', signalType: 'Support Bounce', confidence: 'MEDIUM', detected: '07:55:08', color: 'green' },
    { coin: 'FIL', pair: 'FIL/USDT', exchange: 'Binance Perp', signalType: 'Pattern Long', confidence: 'HIGH', detected: '07:42:15', color: 'yellow' },
    { coin: 'HBAR', pair: 'HBAR/USDT', exchange: 'Bybit Spot', signalType: 'Breakout Short', confidence: 'MEDIUM', detected: '07:30:22', color: 'slate' },
    { coin: 'NEAR', pair: 'NEAR/USDT', exchange: 'OKX Perp', signalType: 'Trend Continuation', confidence: 'HIGH', detected: '07:15:40', color: 'indigo' },
    { coin: 'VET', pair: 'VET/USDT', exchange: 'Binance Perp', signalType: 'Reversal Long', confidence: 'LOW', detected: '07:05:12', color: 'blue' },
  ];

  const filteredSignals = mockSignals.filter(signal => {
    const matchesSearch = signal.pair.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         signal.exchange.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'all' || 
                         (filter === 'bullish' && signal.signalType.toLowerCase().includes('long')) ||
                         (filter === 'bearish' && signal.signalType.toLowerCase().includes('short'));
    return matchesSearch && matchesFilter;
  });

  const totalPages = Math.ceil(filteredSignals.length / itemsPerPage);
  const paginatedSignals = filteredSignals.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getConfidenceColor = (confidence: string) => {
    if (confidence === 'HIGH') return 'text-primary';
    if (confidence === 'MEDIUM') return 'text-red-500';
    return 'text-red-500';
  };

  const getConfidenceBg = (confidence: string) => {
    if (confidence === 'HIGH') return 'bg-primary/10 border-primary/20 text-primary';
    if (confidence === 'MEDIUM') return 'bg-red-500/10 border-red-500/20 text-red-500';
    return 'bg-red-500/10 border-red-500/20 text-red-500';
  };

  const getCoinColor = (color: string) => {
    const colors: Record<string, string> = {
      orange: 'bg-orange-500/20 text-orange-500 ring-orange-500/40',
      purple: 'bg-purple-500/20 text-purple-500 ring-purple-500/40',
      teal: 'bg-teal-500/20 text-teal-500 ring-teal-500/40',
      red: 'bg-red-500/20 text-red-500 ring-red-500/40',
      blue: 'bg-blue-500/20 text-blue-500 ring-blue-500/40',
      green: 'bg-green-500/20 text-green-500 ring-green-500/40',
      pink: 'bg-pink-500/20 text-pink-500 ring-pink-500/40',
      indigo: 'bg-indigo-500/20 text-indigo-500 ring-indigo-500/40',
      yellow: 'bg-yellow-500/20 text-yellow-500 ring-yellow-500/40',
      rose: 'bg-rose-500/20 text-rose-500 ring-rose-500/40',
      cyan: 'bg-cyan-500/20 text-cyan-500 ring-cyan-500/40',
      slate: 'bg-slate-500/20 text-slate-500 ring-slate-500/40',
      emerald: 'bg-emerald-500/20 text-emerald-500 ring-emerald-500/40',
      fuchsia: 'bg-fuchsia-500/20 text-fuchsia-500 ring-fuchsia-500/40',
    };
    return colors[color] || 'bg-gray-500/20 dark:text-gray-500 light:text-slate-500 ring-gray-500/40';
  };

  return (
    <motion.div
      className="flex flex-col h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Header */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 shrink-0">
        <PageHero
          eyebrow={`Monitor · Strategy ${strategyNum}`}
          icon="bookmark_star"
          title={`Strategy ${strategyNum}`}
          subtitle="Live signal feed for this saved strategy."
          tone="primary"
          unboxed
          rightSlot={
            <div className="flex items-center gap-2">
              <a
                href="#"
                className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-400/10 border border-sky-400/30 text-sky-400 text-[10px] font-black uppercase tracking-wider hover:bg-sky-400/20 transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">school</span>
                Learn
              </a>
              <button
                className="grid h-9 w-9 place-items-center rounded-lg border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.04] light:bg-white dark:text-gray-300 light:text-slate-600 hover:text-primary hover:border-primary/30 transition-colors"
                title="Refresh"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
              </button>
            </div>
          }
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden px-8 pb-8 flex flex-col">
        <div className="mx-auto w-full max-w-[1600px] h-full flex flex-col gap-4">
          {/* Search and Filters */}
          <div className="flex items-center gap-3 py-2 bg-background-dark/50 backdrop-blur-sm sticky top-0 z-20 overflow-visible">
            <div className="relative w-60 shrink-0">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 dark:text-gray-500 light:text-slate-500 text-lg">search</span>
              <input
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:dark:text-gray-600 light:text-slate-400 focus:border-primary focus:ring-primary focus:ring-1 transition-colors"
                placeholder="Search..."
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 mr-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-5 py-2 rounded-lg font-bold text-sm transition-all ${
                    filter === 'all'
                      ? 'bg-[#13ec37] text-black shadow-[0_0_15px_rgba(19,236,55,0.4)] hover:shadow-[0_0_20px_rgba(19,236,55,0.6)]'
                      : 'bg-white/5 border border-white/10 dark:text-gray-400 light:text-slate-500 hover:text-white hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter('bullish')}
                  className={`px-5 py-2 rounded-lg font-bold text-sm transition-all ${
                    filter === 'bullish'
                      ? 'bg-[#13ec37] text-black shadow-[0_0_15px_rgba(19,236,55,0.4)]'
                      : 'bg-white/5 border border-white/10 dark:text-gray-400 light:text-slate-500 hover:text-white hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  Bullish
                </button>
                <button
                  onClick={() => setFilter('bearish')}
                  className={`px-5 py-2 rounded-lg font-bold text-sm transition-all ${
                    filter === 'bearish'
                      ? 'bg-[#13ec37] text-black shadow-[0_0_15px_rgba(19,236,55,0.4)]'
                      : 'bg-white/5 border border-white/10 dark:text-gray-400 light:text-slate-500 hover:text-white hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  Bearish
                </button>
              </div>
              <div className="w-px h-6 bg-white/10 mx-2"></div>
              <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 dark:text-gray-300 light:text-slate-600 text-sm font-medium hover:bg-white/10 hover:text-white transition-colors group whitespace-nowrap">
                <span className="material-symbols-outlined text-base group-hover:text-primary transition-colors">filter_list</span>
                More
              </button>
              <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 dark:text-gray-300 light:text-slate-600 text-sm font-medium hover:bg-white/10 hover:text-white transition-colors group whitespace-nowrap">
                <span className="material-symbols-outlined text-base group-hover:text-primary transition-colors">sort</span>
                Sort: Confidence
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-hidden rounded-xl table-glass-panel relative flex flex-col">
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <div className="h-full overflow-y-auto custom-scrollbar">
                <table className="w-full text-sm text-left dark:text-gray-400 light:text-slate-500">
                  <thead className="text-[11px] uppercase dark:text-gray-500 light:text-slate-500 font-bold sticky top-0 bg-[#0a140d] border-b border-white/10 z-10 tracking-wider">
                    <tr>
                      <th className="px-6 py-3" scope="col">Coin</th>
                      <th className="px-6 py-3" scope="col">Exchange</th>
                      <th className="px-6 py-3" scope="col">Signal Type</th>
                      <th className="px-6 py-3 text-center" scope="col">Confidence</th>
                      <th className="px-6 py-3 text-right" scope="col">Detected</th>
                      <th className="px-6 py-3 text-right" scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs font-medium">
                    {paginatedSignals.map((signal, index) => (
                      <tr key={index} className="hover:bg-white/5 transition-colors cursor-pointer group">
                        <td className="px-6 py-2.5 font-bold text-white whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full ${getCoinColor(signal.color)} flex items-center justify-center text-[10px] font-bold ring-1`}>
                              {signal.coin[0]}
                            </div>
                            <span className="text-sm">{signal.pair}</span>
                          </div>
                        </td>
                        <td className="px-6 py-2.5 whitespace-nowrap dark:text-gray-400 light:text-slate-500 group-hover:dark:text-gray-300 light:text-slate-600">{signal.exchange}</td>
                        <td className="px-6 py-2.5 whitespace-nowrap text-white">{signal.signalType}</td>
                        <td className="px-6 py-2.5 text-center">
                          <div className={`flex items-center justify-center gap-1 ${getConfidenceColor(signal.confidence)}`}>
                            <span className="material-symbols-outlined text-sm">
                              {signal.confidence === 'HIGH' ? 'trending_up' : 'trending_down'}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getConfidenceBg(signal.confidence)}`}>
                              {signal.confidence}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-2.5 text-right font-mono dark:text-gray-400 light:text-slate-500">{signal.detected}</td>
                        <td className="px-6 py-2.5 text-right">
                          <button className="text-primary hover:text-white">Analyze</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Pagination */}
            <div className="shrink-0 p-4 border-t border-white/5 flex items-center justify-between">
              <div className="text-xs dark:text-gray-400 light:text-slate-500">
                Showing <span className="font-medium text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                <span className="font-medium text-white">{Math.min(currentPage * itemsPerPage, filteredSignals.length)}</span> of{' '}
                <span className="font-medium text-white">{filteredSignals.length}</span> results
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="pagination-btn flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-base">chevron_left</span>
                  Previous
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`pagination-number ${currentPage === pageNum ? 'active' : ''}`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                {totalPages > 5 && currentPage < totalPages - 2 && (
                  <span className="dark:text-gray-500 light:text-slate-500 px-2">...</span>
                )}
                {totalPages > 5 && (
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    className={`pagination-number ${currentPage === totalPages ? 'active' : ''}`}
                  >
                    {totalPages}
                  </button>
                )}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="pagination-btn flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <span className="material-symbols-outlined text-base">chevron_right</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
