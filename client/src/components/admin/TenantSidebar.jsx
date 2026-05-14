import { useState } from 'react';
import { WA_STATUS } from './constants';

function TenantListRow({ tenant: t, selected, onClick }) {
    const s = WA_STATUS[t.waStatus] || WA_STATUS.disconnected;
    const emailOk = t.bridgeEmail && t.destinationEmail;
    const initials = t.name ? t.name.charAt(0).toUpperCase() : '?';

    return (
        <div
            onClick={onClick}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-[#f0f2f5] transition
                       ${selected ? 'bg-[#f0f2f5]' : 'hover:bg-[#f5f6f6]'}`}>
            <div className="w-12 h-12 rounded-full bg-[#dfe5e7] flex items-center justify-center text-[#075E54] font-bold text-lg flex-shrink-0">
                {initials}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                        <span className="text-xs text-[#8696a0]">{s.text}</span>
                        {!emailOk && <span className="text-orange-400 text-xs">⚠</span>}
                    </div>
                    <span className="font-semibold text-[#111b21] text-sm truncate">{t.name}</span>
                </div>
                <p className="text-xs text-[#8696a0] font-mono text-right mt-0.5">{t.phone}</p>
            </div>
        </div>
    );
}

export default function TenantSidebar({ tenants, selectedId, onSelect, onAdd }) {
    const [search, setSearch] = useState('');
    const connected = tenants.filter(t => t.waStatus === 'connected').length;
    const filtered = tenants.filter(t =>
        t.name.includes(search) || t.phone.includes(search)
    );

    return (
        <aside className="w-[360px] flex-shrink-0 flex flex-col bg-white border-r border-[#d1d7db]" style={{ direction: 'rtl' }}>
            <div className="bg-[#f0f2f5] px-4 py-3 flex items-center justify-between flex-shrink-0">
                <button
                    onClick={onAdd}
                    title="הוסף לקוח"
                    className="w-9 h-9 rounded-full bg-[#25D366] text-white flex items-center justify-center text-xl font-bold hover:bg-[#1fb954] transition shadow-sm">
                    +
                </button>
                <div className="flex items-center gap-2">
                    {tenants.length > 0 && (
                        <span className="text-xs text-[#8696a0]">{connected}/{tenants.length} מחוברים</span>
                    )}
                    <span className="font-semibold text-[#111b21] text-base">לקוחות</span>
                </div>
            </div>

            <div className="px-3 py-2 bg-[#f0f2f5] flex-shrink-0">
                <div className="bg-white rounded-lg px-3 py-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-[#8696a0] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                    </svg>
                    <input
                        className="flex-1 text-sm outline-none text-right bg-transparent placeholder-[#8696a0]"
                        placeholder="חיפוש..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {filtered.length === 0 ? (
                    <div className="p-8 text-center text-[#8696a0] text-sm">
                        {tenants.length === 0 ? 'לחץ + להוספת לקוח ראשון' : 'לא נמצאו תוצאות'}
                    </div>
                ) : (
                    filtered.map(t => (
                        <TenantListRow
                            key={t._id}
                            tenant={t}
                            selected={selectedId === t._id}
                            onClick={() => onSelect(t._id)}
                        />
                    ))
                )}
            </div>
        </aside>
    );
}
