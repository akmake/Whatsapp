import { useEffect } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import AdminPage from '@/pages/AdminPage';
import DashboardPage from '@/pages/DashboardPage';
import LoginPage from '@/pages/LoginPage';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
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
              <header className="bg-[#075E54] text-white flex-shrink-0 shadow">
                <div className="px-6 h-14 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[#25D366] rounded-full flex items-center justify-center font-black text-white text-sm">W</div>
                    <span className="font-semibold text-base tracking-wide">Bridge Manager</span>
                  </div>
                  <nav className="flex gap-1">
                    <NavLink to="/" end className={({ isActive }) =>
                      `px-4 py-2 rounded-lg text-sm font-medium transition ${isActive ? 'bg-white/20' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                      לקוחות
                    </NavLink>
                    <NavLink to="/dashboard" className={({ isActive }) =>
                      `px-4 py-2 rounded-lg text-sm font-medium transition ${isActive ? 'bg-white/20' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                      ניטור
                    </NavLink>
                  </nav>
                </div>
              </header>

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
