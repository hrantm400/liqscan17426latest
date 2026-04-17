import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Trash2, Shield, Diamond } from 'lucide-react';
import { adminApi } from '../../services/userApi';

type GrantsFilter = 'all' | 'active' | 'none';

export function UsersManagement() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [grantsFilter, setGrantsFilter] = useState<GrantsFilter>('all');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', page, search, grantsFilter],
    queryFn: async () => {
      return adminApi.getUsers({
        page,
        limit: 20,
        search,
        grants: grantsFilter,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return adminApi.deleteUser(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ id, isAdmin }: { id: string; isAdmin: boolean }) => {
      return adminApi.updateUser(id, { isAdmin });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  const toggleTierMutation = useMutation({
    mutationFn: async ({ id, tier }: { id: string; tier: string }) => {
      return adminApi.updateUser(id, { tier });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  const users = data?.data || [];

  const setGrants = (v: GrantsFilter) => {
    setGrantsFilter(v);
    setPage(1);
  };

  const filterChips: { value: GrantsFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Has grants' },
    { value: 'none', label: 'No grants' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-black text-white mb-2">Users Management</h1>
        <p className="text-gray-400">Manage all users</p>
      </div>

      <div className="glass-panel rounded-2xl p-4 border border-white/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex-1 relative min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              data-clarity-mask="true"
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {filterChips.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setGrants(value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  grantsFilter === value
                    ? 'bg-primary text-black'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-400">
        Showing {users.length} of {data?.total || 0} users
      </p>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
        </div>
      ) : users.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center border border-white/10">
          <p className="text-gray-400">No users found</p>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase">User</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase">Email</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase">Role</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase">Tier</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase">Grants</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase">Expires</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase">Joined</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {users.map((user: any) => {
                  const grantCount = typeof user.activeFeatureGrantCount === 'number' ? user.activeFeatureGrantCount : 0;
                  return (
                    <motion.tr
                      key={user.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-white/5 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                            {user.name?.[0] || user.email?.[0] || 'U'}
                          </div>
                          <div className="font-bold text-white">{user.name || 'No name'}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-300">{user.email}</td>
                      <td className="px-6 py-4">
                        {user.isAdmin ? (
                          <span className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-sm font-bold">Admin</span>
                        ) : (
                          <span className="px-3 py-1 rounded-lg bg-gray-500/10 text-gray-400 text-sm font-bold">User</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {user.tier && user.tier !== 'FREE' ? (
                          <span className="px-3 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-sm font-bold">
                            {user.tier}
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-lg bg-gray-500/10 text-gray-400 text-sm font-bold">FREE</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {grantCount > 0 ? (
                          <span
                            className="inline-flex min-w-[2rem] justify-center px-2 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 text-sm font-bold border border-cyan-500/20"
                            title="Active admin feature grants"
                          >
                            {grantCount}
                          </span>
                        ) : (
                          <span className="text-gray-500 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-300 text-sm">
                        {user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-4 text-gray-300">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              const newTier = user.tier && user.tier !== 'FREE' ? 'FREE' : 'PAID_MONTHLY';
                              toggleTierMutation.mutate({ id: user.id, tier: newTier });
                            }}
                            className={`p-2 rounded-lg transition-all ${
                              user.tier && user.tier !== 'FREE'
                                ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                                : 'bg-white/5 text-gray-400 hover:text-amber-400'
                            }`}
                            title={user.tier && user.tier !== 'FREE' ? 'Revoke PRO Access' : 'Grant PRO Access'}
                          >
                            <Diamond className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              toggleAdminMutation.mutate({ id: user.id, isAdmin: !user.isAdmin });
                            }}
                            className={`p-2 rounded-lg transition-all ${
                              user.isAdmin
                                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                                : 'bg-white/5 text-gray-400 hover:text-primary'
                            }`}
                            title={user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this user?')) {
                                deleteMutation.mutate(user.id);
                              }
                            }}
                            className="p-2 rounded-lg bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-all"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <Link
                            to={`/admin/users/${user.id}`}
                            className="px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold transition-all"
                            title="Open details"
                          >
                            Details
                          </Link>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.pageCount > 1 && (
        <div className="flex justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-2 rounded bg-white/10 text-white disabled:opacity-40 border border-white/10"
          >
            Prev
          </button>
          <span className="px-3 py-2 text-gray-300">
            Page {page} / {data.pageCount}
          </span>
          <button
            disabled={page >= data.pageCount}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-2 rounded bg-white/10 text-white disabled:opacity-40 border border-white/10"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
