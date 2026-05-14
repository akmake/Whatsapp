import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import ContractModal from '@/components/admin/modals/ContractModal';

export default function AppNavbar() {
    const [showContract, setShowContract] = useState(false);

    return (
        <>
            <header className="bg-[#075E54] text-white flex-shrink-0 shadow">
                <div className="px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#25D366] rounded-full flex items-center justify-center font-black text-white text-sm">W</div>
                        <span className="font-semibold text-base tracking-wide">Bridge Manager</span>
                    </div>
                    <nav className="flex items-center gap-1">
                        <NavLink to="/" end className={({ isActive }) =>
                            `px-4 py-2 rounded-lg text-sm font-medium transition ${isActive ? 'bg-white/20' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                            לקוחות
                        </NavLink>
                        <NavLink to="/dashboard" className={({ isActive }) =>
                            `px-4 py-2 rounded-lg text-sm font-medium transition ${isActive ? 'bg-white/20' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                            ניטור
                        </NavLink>
                        <NavLink to="/logs" className={({ isActive }) =>
                            `px-4 py-2 rounded-lg text-sm font-medium transition ${isActive ? 'bg-white/20' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                            לוגים
                        </NavLink>

                        {/* Divider */}
                        <span className="w-px h-5 bg-white/20 mx-1" />

                        {/* Contract button */}
                        <button onClick={() => setShowContract(true)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            חוזה
                        </button>
                    </nav>
                </div>
            </header>

            {showContract && <ContractModal onClose={() => setShowContract(false)} />}
        </>
    );
}
