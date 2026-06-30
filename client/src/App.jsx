import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ServicesPage from '@/pages/ServicesPage';
import BtbPage from '@/pages/BtbPage';
import AdminPage from '@/pages/AdminPage';
import DashboardPage from '@/pages/DashboardPage';
import LoginPage from '@/pages/LoginPage';
import LogsPage from '@/pages/LogsPage';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import AppNavbar from '@/components/layout/AppNavbar';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { useAuthStore } from '@/stores/authStore';

export default function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <div className="h-screen flex flex-col" dir="rtl">
              <AppNavbar />
              <main className="flex-1 overflow-hidden">
                <ErrorBoundary>
                  <Routes>
                    {/* מסך הפתיחה — בחירת שירות */}
                    <Route path="/" element={<ServicesPage />} />

                    {/* WTM — הגשר וואטסאפ ⇄ מייל (ללא שינוי בפונקציונליות) */}
                    <Route path="/wtm" element={<AdminPage />} />
                    <Route path="/wtm/monitor" element={<DashboardPage />} />
                    <Route path="/wtm/logs" element={<LogsPage />} />

                    {/* BTB — שירות בעלי עסקים (בפיתוח) */}
                    <Route path="/btb" element={<BtbPage />} />

                    {/* תאימות לאחור לקישורים ישנים */}
                    <Route path="/dashboard" element={<Navigate to="/wtm/monitor" replace />} />
                    <Route path="/logs" element={<Navigate to="/wtm/logs" replace />} />

                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </ErrorBoundary>
              </main>
            </div>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
