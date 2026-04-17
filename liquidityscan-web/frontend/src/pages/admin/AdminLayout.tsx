import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen,
  DollarSign, 
  BarChart3, 
  LogOut,
  Menu,
  X,
  Mail,
  Megaphone,
  Settings,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin, isAuthenticated } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Redirect non-admin users — admin panel doesn't exist for them
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isAdmin, navigate]);

  // Don't render anything while redirecting
  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  // Force dark theme for admin panel
  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.classList.contains('light') ? 'light' : root.classList.contains('dark') ? 'dark' : null;
    
    // Remove both theme classes and add dark
    root.classList.remove('light', 'dark');
    root.classList.add('dark');
    
    // Restore previous theme on unmount
    return () => {
      if (previousTheme) {
        root.classList.remove('light', 'dark');
        root.classList.add(previousTheme);
      }
    };
  }, []);

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const menuItems = [
    { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/users', label: 'Users', icon: Users },
    { path: '/admin/courses', label: 'Courses', icon: BookOpen },
    { path: '/admin/payments', label: 'Payments', icon: DollarSign },
    { path: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { path: '/admin/email-logs', label: 'Email Logs', icon: Mail },
    { path: '/admin/broadcast', label: 'Broadcast', icon: Megaphone },
    { path: '/admin/settings', label: 'Settings', icon: Settings },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen dark:bg-[#050505] light:bg-background-light overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-64 bg-black/40 backdrop-blur-xl border-r border-white/10 transition-transform duration-300`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-black text-white">
                <span className="text-primary">ADMIN</span>
              </h1>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden dark:text-gray-400 light:text-slate-500 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    active
                      ? 'bg-primary text-black font-bold shadow-lg shadow-primary/50'
                      : 'dark:text-gray-400 light:text-slate-500 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Section */}
          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                {user?.name?.[0] || user?.email?.[0] || 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white truncate">
                  {user?.name || user?.email || 'Admin'}
                </div>
                <div className="text-xs dark:text-gray-400 light:text-slate-500 truncate">{user?.email}</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-xl text-red-400 hover:bg-red-500/10 transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden dark:bg-[#050505] light:bg-background-light">
        {/* Header */}
        <header className="h-16 bg-black/40 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden dark:text-gray-400 light:text-slate-500 hover:text-white"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="px-4 py-2 rounded-lg bg-white/5 text-white hover:bg-white/10 transition-all text-sm font-medium"
            >
              Back to App
            </Link>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 dark:bg-[#050505] light:bg-background-light">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
