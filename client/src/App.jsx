import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminPage from '@/pages/AdminPage';
import DashboardPage from '@/pages/DashboardPage';
import LoginPage from '@/pages/LoginPage';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import AppNavbar from '@/components/layout/AppNavbar';
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
                <Routes>
                  <Route path="/" element={<AdminPage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
