import { NavLink } from 'react-router-dom';

export default function AppNavbar() {
    return (
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
    );
}
