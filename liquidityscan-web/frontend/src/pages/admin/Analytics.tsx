import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { TrendingUp, Users, DollarSign } from 'lucide-react';
import { adminApi } from '../../services/userApi';

export function Analytics() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: async () => {
      return adminApi.getAnalytics();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-black text-white mb-2">Analytics</h1>
        <p className="dark:text-gray-400 light:text-slate-500">Platform statistics and insights</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-2xl p-6 border border-white/10"
        >
          <div className="flex items-center justify-between mb-4">
            <Users className="w-8 h-8 text-blue-400" />
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <div className="text-3xl font-black text-white mb-1">{analytics?.stats?.totalUsers || 0}</div>
          <div className="text-sm dark:text-gray-400 light:text-slate-500">Total Users</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel rounded-2xl p-6 border border-white/10"
        >
          <div className="flex items-center justify-between mb-4">
            <DollarSign className="w-8 h-8 text-yellow-400" />
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <div className="text-3xl font-black text-white mb-1">
            ${Number(analytics?.stats?.revenue ?? 0).toFixed(2)}
          </div>
          <div className="text-sm dark:text-gray-400 light:text-slate-500">Total Revenue</div>
        </motion.div>
      </div>

      {/* Charts placeholder */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10">
        <h2 className="text-xl font-bold text-white mb-4">Revenue Chart</h2>
        <div className="h-64 flex items-center justify-center dark:text-gray-400 light:text-slate-500">
          Chart will be implemented here
        </div>
      </div>
    </div>
  );
}
