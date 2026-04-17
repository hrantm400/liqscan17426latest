import { lazy, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { NeonLoader } from './components/shared/NeonLoader';
import { ThemeProvider } from './contexts/ThemeContext';
import MainLayout from './components/MainLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AnimatedPage } from './components/animations/AnimatedPage';
import { OAuthHandler } from './components/OAuthHandler';
import { CommandPalette } from './components/shared/CommandPalette';
import { LaunchPromoBanner } from './components/shared/LaunchPromoBanner';
import { RequireAuth, GuestOnlyRoute } from './components/auth/AuthRoutes';
import { ClarityIdentifyBridge } from './hooks/useClarityIdentify';
import { GaTrackingBridge } from './hooks/useGaTracking';
import './index.css';

// Lazy load pages for code splitting
const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const MonitorSuperEngulfing = lazy(() => import('./pages/MonitorSuperEngulfing').then(m => ({ default: m.MonitorSuperEngulfing })));
const MonitorBias = lazy(() => import('./pages/MonitorBias').then(m => ({ default: m.MonitorBias })));
const MonitorRSI = lazy(() => import('./pages/MonitorRSI').then(m => ({ default: m.MonitorRSI })));
const MonitorCRT = lazy(() => import('./pages/MonitorCRT').then(m => ({ default: m.MonitorCRT })));
const Monitor3OB = lazy(() => import('./pages/Monitor3OB').then(m => ({ default: m.Monitor3OB })));
const MonitorCISD = lazy(() => import('./pages/MonitorCISD').then(m => ({ default: m.MonitorCISD })));
const Watchlist = lazy(() => import('./pages/Watchlist').then(m => ({ default: m.Watchlist })));
const TopMarketCoins = lazy(() => import('./pages/TopMarketCoins').then(m => ({ default: m.TopMarketCoins })));

const SignalDetails = lazy(() => import('./pages/SignalDetails').then(m => ({ default: m.SignalDetails })));
const StrategiesDashboard = lazy(() => import('./pages/StrategiesDashboard').then(m => ({ default: m.StrategiesDashboard })));
const StrategyDetail = lazy(() => import('./pages/StrategyDetail').then(m => ({ default: m.StrategyDetail })));
const ToolsDashboard = lazy(() => import('./pages/ToolsDashboard').then(m => ({ default: m.ToolsDashboard })));
const DailyRecap = lazy(() => import('./pages/DailyRecap').then(m => ({ default: m.DailyRecap })));
const RiskCalculator = lazy(() => import('./pages/RiskCalculator').then(m => ({ default: m.RiskCalculator })));
const SuperEngulfing = lazy(() => import('./pages/SuperEngulfing').then(m => ({ default: m.SuperEngulfing })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Support = lazy(() => import('./pages/Support').then(m => ({ default: m.Support })));
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Register').then(m => ({ default: m.Register })));
const Profile = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
const Subscriptions = lazy(() => import('./pages/Subscriptions').then(m => ({ default: m.Subscriptions })));
const Payment = lazy(() => import('./pages/Payment').then(m => ({ default: m.Payment })));

// Admin Pages
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout').then(m => ({ default: m.AdminLayout })));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const UsersManagement = lazy(() => import('./pages/admin/UsersManagement').then(m => ({ default: m.UsersManagement })));
const PaymentsManagement = lazy(() => import('./pages/admin/PaymentsManagement').then(m => ({ default: m.PaymentsManagement })));
const Analytics = lazy(() => import('./pages/admin/Analytics').then(m => ({ default: m.Analytics })));
const CoursesManagement = lazy(() => import('./pages/admin/CoursesManagement').then(m => ({ default: m.CoursesManagement })));
const AdminCourseDetail = lazy(() => import('./pages/admin/AdminCourseDetail').then(m => ({ default: m.AdminCourseDetail })));
const AdminUserDetail = lazy(() => import('./pages/admin/AdminUserDetail').then(m => ({ default: m.AdminUserDetail })));
const AdminEmailLogs = lazy(() => import('./pages/admin/AdminEmailLogs').then(m => ({ default: m.AdminEmailLogs })));
const AdminBroadcast = lazy(() => import('./pages/admin/AdminBroadcast').then(m => ({ default: m.AdminBroadcast })));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings').then(m => ({ default: m.AdminSettings })));
const Courses = lazy(() => import('./pages/Courses').then(m => ({ default: m.Courses })));
const CourseDetail = lazy(() => import('./pages/CourseDetail').then(m => ({ default: m.CourseDetail })));
const AffiliateDashboard = lazy(() => import('./pages/AffiliateDashboard').then(m => ({ default: m.AffiliateDashboard })));



const LoadingFallback = () => (
  <div className="flex items-center justify-center h-screen w-full bg-background-dark">
    <div className="flex flex-col items-center gap-4">
      <NeonLoader />
      <div className="text-white text-lg font-mono">Loading...</div>
    </div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        // Do not retry when auth is expired; it only spams 401s.
        if (error?.name === 'AuthExpiredError') return false;
        return failureCount < 2;
      },
    },
  },
});

function AppRoutes() {
  const location = useLocation();

  return (
    <>
      <OAuthHandler />
      <CommandPalette />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          {/* Public: landing only */}
          <Route path="/" element={<LandingPage />} />

          {/* Guests only — logged-in users go to dashboard */}
          <Route element={<GuestOnlyRoute />}>
            <Route path="/login" element={<AnimatedPage><Login /></AnimatedPage>} />
            <Route path="/register" element={<AnimatedPage><Register /></AnimatedPage>} />
          </Route>

          {/* OAuth redirect target — keep URL until OAuthHandler reads query params */}
          <Route
            path="/oauth-callback"
            element={
              <div className="flex min-h-screen items-center justify-center dark:bg-background-dark light:bg-background-light">
                <NeonLoader />
              </div>
            }
          />

          {/* Redirect /app to dashboard */}
          <Route path="/app" element={<Navigate to="/dashboard" replace />} />
          <Route path="/app/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/app/dashboard" element={<Navigate to="/dashboard" replace />} />

          {/* Authenticated app */}
          <Route element={<RequireAuth />}>
          <Route element={<MainLayout />}>
            <Route path="dashboard" element={<AnimatedPage><Dashboard /></AnimatedPage>} />
            <Route path="watchlist" element={<AnimatedPage><Watchlist /></AnimatedPage>} />
            <Route path="top-coins" element={<AnimatedPage><TopMarketCoins /></AnimatedPage>} />
            <Route path="monitor/superengulfing" element={<AnimatedPage><MonitorSuperEngulfing /></AnimatedPage>} />
            <Route path="monitor/bias" element={<AnimatedPage><MonitorBias /></AnimatedPage>} />
            <Route path="monitor/rsi" element={<AnimatedPage><MonitorRSI /></AnimatedPage>} />
            <Route path="monitor/crt" element={<AnimatedPage><MonitorCRT /></AnimatedPage>} />
            <Route path="monitor/3ob" element={<AnimatedPage><Monitor3OB /></AnimatedPage>} />
            <Route path="monitor/cisd" element={<AnimatedPage><MonitorCISD /></AnimatedPage>} />
            <Route path="signals/:id" element={<AnimatedPage><SignalDetails /></AnimatedPage>} />
            <Route path="strategies" element={<AnimatedPage><StrategiesDashboard /></AnimatedPage>} />
            <Route path="strategies/1" element={<Navigate to="/strategies" replace />} />

            <Route path="strategies/:id" element={<AnimatedPage><StrategyDetail /></AnimatedPage>} />
            <Route path="tools" element={<AnimatedPage><ToolsDashboard /></AnimatedPage>} />
            <Route path="daily-recap" element={<AnimatedPage><DailyRecap /></AnimatedPage>} />
            <Route path="risk-calculator" element={<AnimatedPage><RiskCalculator /></AnimatedPage>} />
            <Route path="superengulfing" element={<SuperEngulfing />} />
            <Route path="settings" element={<AnimatedPage><Settings /></AnimatedPage>} />
            <Route path="support" element={<AnimatedPage><Support /></AnimatedPage>} />
            <Route path="profile" element={<AnimatedPage><Profile /></AnimatedPage>} />
            <Route path="courses" element={<AnimatedPage><Courses /></AnimatedPage>} />
            <Route path="courses/:id" element={<AnimatedPage><CourseDetail /></AnimatedPage>} />
            <Route path="subscription" element={<AnimatedPage><Subscriptions /></AnimatedPage>} />
            <Route path="subscriptions" element={<AnimatedPage><Subscriptions /></AnimatedPage>} />
            <Route path="affiliate" element={<AnimatedPage><AffiliateDashboard /></AnimatedPage>} />
            <Route path="payment/:id" element={<AnimatedPage><Payment /></AnimatedPage>} />
          </Route>
          </Route>

          {/* Admin — same session gate; AdminLayout enforces isAdmin */}
          <Route element={<RequireAuth />}>
          <Route element={<AdminLayout />}>
            <Route path="admin" element={<AnimatedPage><AdminDashboard /></AnimatedPage>} />
            <Route path="admin/users" element={<AnimatedPage><UsersManagement /></AnimatedPage>} />
            <Route path="admin/users/:id" element={<AnimatedPage><AdminUserDetail /></AnimatedPage>} />
            <Route path="admin/courses" element={<AnimatedPage><CoursesManagement /></AnimatedPage>} />
            <Route path="admin/courses/:id" element={<AnimatedPage><AdminCourseDetail /></AnimatedPage>} />
            <Route path="admin/payments" element={<AnimatedPage><PaymentsManagement /></AnimatedPage>} />
            <Route path="admin/analytics" element={<AnimatedPage><Analytics /></AnimatedPage>} />
            <Route path="admin/email-logs" element={<AnimatedPage><AdminEmailLogs /></AnimatedPage>} />
            <Route path="admin/broadcast" element={<AnimatedPage><AdminBroadcast /></AnimatedPage>} />
            <Route path="admin/settings" element={<AnimatedPage><AdminSettings /></AnimatedPage>} />
          </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <BrowserRouter>
              <ClarityIdentifyBridge />
              <GaTrackingBridge />
              <LaunchPromoBanner />
              <Suspense fallback={<LoadingFallback />}>
                <AppRoutes />
              </Suspense>
              <Toaster
                position="top-right"
                toastOptions={{
                  style: {
                    background: '#1a1f1c',
                    color: '#e5e7eb',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    fontSize: '13px',
                  },
                  success: { iconTheme: { primary: '#13ec37', secondary: '#0a0e0b' } },
                  error: { iconTheme: { primary: '#ff4444', secondary: '#0a0e0b' } },
                }}
              />
            </BrowserRouter>
          </ThemeProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
