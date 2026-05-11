import { Outlet, Link } from 'react-router-dom'; // וודא ש-Link מיובא
import Navbar from './Navbar';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      
      <main className="flex-grow">
        <Outlet />
      </main>

      <footer className="bg-slate-900 text-slate-400 py-8 border-t border-slate-800 text-sm">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            
            <div className="text-center md:text-right">
              <p className="font-bold text-slate-200 mb-1">CityLine Systems</p>
              <p>פתרונות תחבורה והיסעים למוסדות וארגונים.</p>
            </div>

            {/* הקישורים האמיתיים */}
            <div className="flex gap-6 text-xs">
              <Link to="/terms" className="hover:text-white transition">תנאי שימוש</Link>
              <Link to="/privacy" className="hover:text-white transition">מדיניות פרטיות</Link>
              <Link to="/accessibility" className="hover:text-white transition">הצהרת נגישות</Link>
            </div>

            <div className="text-slate-600">
              © {new Date().getFullYear()} כל הזכויות שמורות.
            </div>
            
          </div>
        </div>
      </footer>
    </div>
  );
}