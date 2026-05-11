import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { BusFront, Phone, LogOut, LayoutDashboard, Menu, X, Clock } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // הגדרת אזורי הגלילה
  const MENU_ITEMS = [
    { id: 'hero', label: 'ראשי' },
    { id: 'services', label: 'שירותים' },
    { id: 'reviews', label: 'לקוחות ממליצים' },
    { id: 'contact', label: 'צור קשר' },
  ];

  const scrollToSection = (id) => {
    setMobileMenuOpen(false);
    
    if (location.pathname !== '/') {
        window.location.href = `/#${id}`;
        return;
    }

    const element = document.getElementById(id);
    if (element) {
      const offset = 80; // קיזוז גובה הנאבר
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  // מנגנון Scroll Spy וזיהוי גלילה
  useEffect(() => {
    const handleScroll = () => {
      // 1. שינוי עיצוב הנאבר בגלילה
      setIsScrolled(window.scrollY > 50);

      // 2. זיהוי האזור הפעיל
      if (location.pathname === '/') {
        let current = '';
        const sections = MENU_ITEMS.map(item => item.id);
        
        for (const section of sections) {
          const element = document.getElementById(section);
          if (element) {
             const rect = element.getBoundingClientRect();
             // אם אזור נמצא בטווח הראייה
             if (rect.top <= 150 && rect.bottom >= 150) {
               current = section;
             }
          }
        }
        if (current) setActiveSection(current);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.pathname]);

  return (
    <nav className={`fixed w-full top-0 z-50 transition-all duration-300 border-b ${isScrolled ? 'bg-slate-900/95 backdrop-blur-md py-2 border-slate-800 shadow-xl' : 'bg-slate-900 py-4 border-transparent'}`}>
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-14">

          {/* לוגו */}
          <Link to="/" onClick={() => scrollToSection('hero')} className="text-xl md:text-2xl font-bold flex items-center gap-3 hover:opacity-90 transition text-white">
            <div className="bg-white/10 p-2 rounded-lg">
              <BusFront size={24} className="text-blue-400" />
            </div>
            <span className="tracking-wide hidden sm:block">CityLine <span className="text-blue-400 font-light">Systems</span></span>
          </Link>

          {/* תפריט דסקטופ (גלולות) */}
          <div className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10 backdrop-blur-sm">
             {MENU_ITEMS.map((item) => (
               <button
                 key={item.id}
                 onClick={() => scrollToSection(item.id)}
                 className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300
                   ${activeSection === item.id 
                     ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' 
                     : 'text-gray-300 hover:text-white hover:bg-white/10'}`}
               >
                 {item.label}
               </button>
             ))}
          </div>

          {/* כפתורי צד */}
          <div className="flex items-center gap-3">
            <a href="tel:088587626" className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-full text-sm font-bold transition shadow-lg shadow-green-900/20">
               <Phone size={16} /> <span className="hidden lg:inline">08-8587626</span>
            </a>

            <Link
              to="/buses"
              className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-600 text-white px-3 py-2 rounded-full text-sm font-medium transition"
              title="לוח זמנים לאוטובוסים"
            >
              <Clock size={15} />
              <span className="hidden lg:inline">לוח זמנים</span>
            </Link>

            {user?.role === 'admin' && (
              <Link to="/admin" className="text-gray-300 hover:text-white p-2 transition" title="ניהול">
                <LayoutDashboard size={20} />
              </Link>
            )}

            {user && (
               <button onClick={logout} className="text-gray-300 hover:text-red-400 p-2 transition" title="התנתק">
                  <LogOut size={20} />
               </button>
            )}

            <button 
              className="md:hidden text-white p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      {/* תפריט מובייל */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-slate-900 border-t border-slate-800 shadow-2xl animate-fade-in">
           <div className="flex flex-col p-4 space-y-2">
             {MENU_ITEMS.map((item) => (
               <button
                 key={item.id}
                 onClick={() => scrollToSection(item.id)}
                 className={`text-right px-4 py-3 rounded-lg text-sm font-medium transition-colors
                   ${activeSection === item.id ? 'bg-blue-600/20 text-blue-400' : 'text-gray-300 hover:bg-white/5'}`}
               >
                 {item.label}
               </button>
             ))}
           </div>
        </div>
      )}
    </nav>
  );
}