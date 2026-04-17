import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { userApi } from '../services/userApi';
import { toast } from 'react-hot-toast';

interface AffiliateStats {
    code: string;
    tier: string;
    commissionRate: number;
    totalSales: number;
    totalEarned: number;
    totalReferrals: number;
    totalConverted: number;
    conversionRate: string;
    referralLink: string;
    recentReferrals: any[];
    recentPayouts: any[];
}

export function AffiliateDashboard() {
    const [stats, setStats] = useState<AffiliateStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [customCode, setCustomCode] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            setLoading(true);
            const data = await userApi.getAffiliateStats();
            setStats(data);
        } catch {
            // No affiliate yet — that's fine
        } finally {
            setLoading(false);
        }
    };

    const createAffiliate = async () => {
        try {
            setCreating(true);
            await userApi.createAffiliate(customCode || undefined);
            toast.success('Affiliate account created! 🎉');
            await loadStats();
        } catch (e: any) {
            toast.error(e.message || 'Failed to create affiliate');
        } finally {
            setCreating(false);
        }
    };

    const copyLink = () => {
        if (stats?.referralLink) {
            navigator.clipboard.writeText(stats.referralLink);
            setCopied(true);
            toast.success('Link copied!');
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        );
    }

    // No affiliate account yet → show signup
    if (!stats) {
        return (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-6 md:p-8 max-w-2xl mx-auto space-y-6">
                <div className="text-center">
                    <h1 className="text-3xl font-black dark:text-white light:text-text-dark mb-2">Affiliate Program</h1>
                    <p className="dark:text-gray-400 light:text-gray-500">Earn 30% recurring commission on every referral.</p>
                </div>

                <div className="glass-panel rounded-2xl p-8 text-center border dark:border-white/10 light:border-green-300">
                    <span className="material-symbols-outlined text-primary text-5xl mb-4 block">handshake</span>
                    <h2 className="text-xl font-bold dark:text-white light:text-text-dark mb-2">Join the Program</h2>
                    <p className="dark:text-gray-400 light:text-gray-500 text-sm mb-6">
                        Share your link, earn <strong className="text-primary">$14.70/month</strong> per referral (30% of $49).
                    </p>

                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="p-3 rounded-xl dark:bg-white/5 light:bg-green-50 border dark:border-white/5 light:border-green-200">
                            <div className="text-2xl font-black text-primary mb-1">30%</div>
                            <div className="text-[9px] dark:text-gray-500 light:text-gray-400 uppercase tracking-wider">Standard</div>
                        </div>
                        <div className="p-3 rounded-xl dark:bg-white/5 light:bg-green-50 border dark:border-white/5 light:border-green-200">
                            <div className="text-2xl font-black text-yellow-400 mb-1">40%</div>
                            <div className="text-[9px] dark:text-gray-500 light:text-gray-400 uppercase tracking-wider">Elite (50+)</div>
                        </div>
                        <div className="p-3 rounded-xl dark:bg-white/5 light:bg-green-50 border dark:border-white/5 light:border-green-200">
                            <div className="text-2xl font-black text-blue-400 mb-1">90d</div>
                            <div className="text-[9px] dark:text-gray-500 light:text-gray-400 uppercase tracking-wider">Cookie</div>
                        </div>
                    </div>

                    <div className="flex gap-2 mb-4">
                        <input
                            type="text"
                            value={customCode}
                            onChange={e => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                            placeholder="Custom code (optional)"
                            className="glass-input flex-1 px-4 py-3 rounded-xl text-sm font-mono uppercase border dark:border-white/10 light:border-gray-300"
                            maxLength={12}
                        />
                    </div>

                    <button
                        onClick={createAffiliate}
                        disabled={creating}
                        className="w-full py-3.5 rounded-2xl bg-primary text-black font-bold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {creating ? (
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black" />
                        ) : (
                            <>
                                <span className="material-symbols-outlined">person_add</span>
                                Create Affiliate Account
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        );
    }

    // Affiliate Dashboard
    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-black dark:text-white light:text-text-dark mb-1">Affiliate Dashboard</h1>
                <p className="text-sm dark:text-gray-400 light:text-gray-500">
                    Tier: <strong className="text-primary">{stats.tier}</strong> · {stats.commissionRate}% commission
                </p>
            </div>

            {/* Referral Link */}
            <div className="glass-panel rounded-2xl p-5 border dark:border-white/10 light:border-green-300 flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-xl">link</span>
                <div className="flex-1 font-mono text-sm dark:text-gray-300 light:text-gray-600 truncate">{stats.referralLink}</div>
                <button onClick={copyLink} className="px-4 py-2 rounded-xl bg-primary text-black font-bold text-xs flex items-center gap-1.5 hover:scale-105 transition-all">
                    <span className="material-symbols-outlined text-sm">{copied ? 'check' : 'content_copy'}</span>
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="glass-panel rounded-xl p-4 text-center border dark:border-white/5 light:border-green-200">
                    <div className="text-2xl font-black text-primary font-mono">{stats.totalReferrals}</div>
                    <div className="text-[9px] dark:text-gray-500 light:text-gray-400 uppercase tracking-wider mt-1">Referrals</div>
                </div>
                <div className="glass-panel rounded-xl p-4 text-center border dark:border-white/5 light:border-green-200">
                    <div className="text-2xl font-black text-green-400 font-mono">{stats.totalConverted}</div>
                    <div className="text-[9px] dark:text-gray-500 light:text-gray-400 uppercase tracking-wider mt-1">Converted</div>
                </div>
                <div className="glass-panel rounded-xl p-4 text-center border dark:border-white/5 light:border-green-200">
                    <div className="text-2xl font-black text-yellow-400 font-mono">{stats.conversionRate}%</div>
                    <div className="text-[9px] dark:text-gray-500 light:text-gray-400 uppercase tracking-wider mt-1">Conv. Rate</div>
                </div>
                <div className="glass-panel rounded-xl p-4 text-center border border-primary/30 bg-primary/5">
                    <div className="text-2xl font-black text-primary font-mono drop-shadow-[0_0_12px_rgba(19,236,55,0.3)]">${stats.totalEarned.toFixed(2)}</div>
                    <div className="text-[9px] text-primary/60 uppercase tracking-wider mt-1">Total Earned</div>
                </div>
            </div>

            {/* Recent Referrals */}
            {stats.recentReferrals.length > 0 && (
                <div className="glass-panel rounded-2xl p-5 border dark:border-white/5 light:border-green-200">
                    <h3 className="text-sm font-black dark:text-gray-400 light:text-gray-500 uppercase tracking-widest mb-4">Recent Referrals</h3>
                    <div className="space-y-2">
                        {stats.recentReferrals.map((ref: any) => (
                            <div key={ref.id} className="flex items-center justify-between p-3 rounded-xl dark:bg-white/[0.02] light:bg-gray-50 border dark:border-white/5 light:border-gray-100">
                                <div className="flex items-center gap-3">
                                    <span className={`text-xs font-black px-2 py-1 rounded ${ref.status === 'CONVERTED' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                        {ref.status}
                                    </span>
                                    <span className="text-xs dark:text-gray-400 light:text-gray-500">{ref.referredUserId.substring(0, 8)}...</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    {ref.commission != null && (
                                        <span className="text-xs font-bold text-green-400 font-mono">+${ref.commission.toFixed(2)}</span>
                                    )}
                                    <span className="text-[10px] dark:text-gray-600 light:text-gray-400">{new Date(ref.createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Payouts */}
            {stats.recentPayouts.length > 0 && (
                <div className="glass-panel rounded-2xl p-5 border dark:border-white/5 light:border-green-200">
                    <h3 className="text-sm font-black dark:text-gray-400 light:text-gray-500 uppercase tracking-widest mb-4">Payouts</h3>
                    <div className="space-y-2">
                        {stats.recentPayouts.map((p: any) => (
                            <div key={p.id} className="flex items-center justify-between p-3 rounded-xl dark:bg-white/[0.02] light:bg-gray-50 border dark:border-white/5 light:border-gray-100">
                                <div className="flex items-center gap-3">
                                    <span className={`text-xs font-black px-2 py-1 rounded ${p.status === 'PROCESSED' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                        {p.status}
                                    </span>
                                    <span className="text-sm font-bold font-mono dark:text-white light:text-text-dark">${p.amount.toFixed(2)} {p.currency}</span>
                                </div>
                                <span className="text-[10px] dark:text-gray-600 light:text-gray-400">{new Date(p.createdAt).toLocaleDateString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </motion.div>
    );
}
