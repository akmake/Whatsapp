import { create } from 'zustand';
import api from '../services/api';

export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true, // בטעינה ראשונית אנחנו בודקים אם המשתמש מחובר
  error: null,

  // בדיקה אם המשתמש מחובר (רצה בעליית האפליקציה)
  checkAuth: async () => {
    try {
      set({ isLoading: true });
      const { data } = await api.get('/auth/me');
      set({ user: data.data.user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      // אם נכשל - המשתמש לא מחובר, וזה בסדר
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  // הרשמה
  register: async (userData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post('/auth/register', userData);
      set({ user: data.data.user, isAuthenticated: true, isLoading: false });
      return true; // הצלחה
    } catch (err) {
      set({ 
        error: err.response?.data?.message || 'שגיאה בהרשמה', 
        isLoading: false 
      });
      return false;
    }
  },

  // התחברות
  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      set({ user: data.data.user, isAuthenticated: true, isLoading: false });
      return true;
    } catch (err) {
      set({ 
        error: err.response?.data?.message || 'שגיאה בהתחברות', 
        isLoading: false 
      });
      return false;
    }
  },

  // התנתקות
  logout: async () => {
    try {
      await api.post('/auth/logout');
      set({ user: null, isAuthenticated: false });
    } catch (err) {
      console.error('Logout error', err);
    }
  },
}));