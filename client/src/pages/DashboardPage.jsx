import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const WA_STATUS = {
    connected:    { text: 'מחובר',        dot: 'bg-[#25D366]', badge: 'bg-[#dcf8c6] text-[#075E54] ring-[#25D366]/30' },
    connecting:   { text: 'מתחבר...',      dot: 'bg-yellow-400', badge: 'bg-yellow-50 text-yellow-700 ring-yellow-200' },
    waiting_qr:   { text: 'ממתין לסריקה', dot: 'bg-blue-500',   badge: 'bg-blue-50 text-blue-700 ring-blue-200' },
    disconnected: { text: 'מנותק',         dot: 'bg-red-500',    badge: 'bg-red-50 text-red-700 ring-red-200' },
};

const fmt = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const elapsed = (iso) => {
    if (!iso) return '—';
    const secs = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (secs < 60) return `${secs}ש'`;
    if (secs < 3600) return `${Math.floor(secs / 60)}ד'`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}ש"ע`;
    return `${Math.floor(secs / 86400)} ימים`;
};

export default function DashboardPage() {
    const [data, setData] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            const res = await api.get('/dashboard');
            setData(res.data);
            setLastUpdate(new Date());
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => {
        fetchData();
        const i = setInterval(fetchData, 4000);
        return () => clearInterval(i);
    }, [fetchData]);

    if (!data) return (
        <div className="h-full flex items-center justify-center text-[#8696a0]">
            <div className="text-center">
                <div className="w-8 h-8 border-2 border-[#25D366] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm">טוען נתונים...</p>
            </div>
        </div>
    );

    const { summary, tenants } = data;

    return (
        <div className="h-full overflow-y-auto" style={{ backgroundColor: '#eae6df' }}>
            <div className="p-6 space-y-5">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-[#111b21]">דשבורד ניטור</h2>
                        <p className="text-xs text-[#8696a0] mt-0.5">
                            עדכון אחרון: {lastUpdate ? lastUpdate.toLocaleTimeString('he-IL') : '—'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#8696a0] bg-white px-3 py-1.5 rounded-full shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse" />
                        כל 4 שניות
                    </div>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <MetricCard label="סה״כ לקוחות"      value={summary.total}              icon="👥" color="text-[#111b21]"   bg="bg-white" />
                    <MetricCard label="מחוברים"            value={summary.connected}           icon="✅" color="text-[#075E54]"   bg="bg-[#dcf8c6]" />
                    <MetricCard label="מנותקים"            value={summary.disconnected}         icon="❌" color="text-red-600"    bg="bg-red-50" />
                    <MetricCard label="ממתינים לסריקה"    value={summary.waitingQr}            icon="📱" color="text-blue-600"   bg="bg-blue-50" />
                    <MetricCard label="מייל לא מוגדר"     value={summary.emailNotConfigured}   icon="⚠️" color="text-orange-600" bg="bg-orange-50" />
                    <MetricCard label="WA → מייל"          value={summary.totalWaToEmail}       icon="💬" color="text-purple-600" bg="bg-purple-50" />
                    <MetricCard label="מייל → WA"          value={summary.totalEmailToWa}       icon="📧" color="text-cyan-600"   bg="bg-cyan-50" />
                </div>

                {/* Table */}
                {tenants.length === 0 ? (
                    <div className="bg-white rounded-xl border border-dashed border-[#d1d7db] p-16 text-center">
                        <p className="text-3xl mb-2">📊</p>
                        <p className="text-[#8696a0] text-sm">אין לקוחות להצגה</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-[#f0f2f5] bg-[#f0f2f5]/60">
                                        <Th>לקוח</Th>
                                        <Th>מספר WA</Th>
                                        <Th>מייל תעבורה</Th>
                                        <Th>מייל ייעד</Th>
                                        <Th center>סטטוס WA</Th>
                                        <Th center>גשר מייל</Th>
                                        <Th center>WA→מייל</Th>
                                        <Th center>מייל→WA</Th>
                                        <Th>הודעה אחרונה</Th>
                                        <Th>מחובר מאז</Th>
                                        <Th center>reconnects</Th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#f0f2f5]">
                                    {tenants.map(t => <TenantRow key={t._id} t={t} />)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function TenantRow({ t }) {
    const waS = WA_STATUS[t.wa.status] || WA_STATUS.disconnected;
    return (
        <tr className={`hover:bg-[#f5f6f6] transition ${t.wa.status === 'disconnected' ? 'bg-red-50/40' : ''}`}>
            <td className="px-4 py-3 font-semibold text-[#111b21]">{t.name}</td>
            <td className="px-4 py-3 text-[#8696a0] font-mono text-xs">{t.phone}</td>
            <td className="px-4 py-3 text-xs">
                {t.bridgeEmail ? <span className="text-[#54656f]">{t.bridgeEmail}</span>
                    : <span className="text-orange-500 font-medium">לא מוגדר</span>}
            </td>
            <td className="px-4 py-3 text-xs">
                {t.destinationEmail ? <span className="text-[#54656f]">{t.destinationEmail}</span>
                    : <span className="text-orange-500 font-medium">לא מוגדר</span>}
            </td>
            <td className="px-4 py-3 text-center">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${waS.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${waS.dot} ${t.wa.status === 'connected' ? 'animate-pulse' : ''}`} />
                    {waS.text}
                </span>
            </td>
            <td className="px-4 py-3 text-center">
                {t.bridge.active
                    ? <span className="text-xs font-medium text-[#075E54] bg-[#dcf8c6] px-2 py-0.5 rounded-full ring-1 ring-[#25D366]/30">פעיל</span>
                    : <span className="text-xs text-[#8696a0] bg-[#f0f2f5] px-2 py-0.5 rounded-full ring-1 ring-[#d1d7db]">כבוי</span>}
            </td>
            <td className="px-4 py-3 text-center">
                <span className="text-xs font-mono font-bold text-purple-600">{t.bridge.waToEmail}</span>
            </td>
            <td className="px-4 py-3 text-center">
                <span className="text-xs font-mono font-bold text-cyan-600">{t.bridge.emailToWa}</span>
            </td>
            <td className="px-4 py-3 text-xs text-[#54656f] whitespace-nowrap">
                {t.wa.lastMsgAt ? (
                    <span className="flex items-center gap-1">
                        <span>{elapsed(t.wa.lastMsgAt)}</span>
                        <span className="text-[#d1d7db]">·</span>
                        <span className="text-[#8696a0]">{t.wa.lastMsgDirection === 'wa_in' ? '⬇' : '⬆'}</span>
                    </span>
                ) : '—'}
            </td>
            <td className="px-4 py-3 text-xs text-[#54656f] whitespace-nowrap">{fmt(t.wa.connectedAt)}</td>
            <td className="px-4 py-3 text-center">
                <span className={`text-xs font-mono font-bold ${t.wa.reconnectCount > 3 ? 'text-red-500' : 'text-[#8696a0]'}`}>
                    {t.wa.reconnectCount}
                </span>
            </td>
        </tr>
    );
}

function Th({ children, center }) {
    return (
        <th className={`px-4 py-3 text-xs font-semibold text-[#8696a0] ${center ? 'text-center' : 'text-right'}`}>
            {children}
        </th>
    );
}

function MetricCard({ label, value, icon, color, bg }) {
    return (
        <div className={`${bg} rounded-xl p-4 shadow-sm`}>
            <div className="flex items-start justify-between mb-1">
                <span className="text-base leading-none">{icon}</span>
                <p className="text-xs text-[#8696a0] text-right">{label}</p>
            </div>
            <p className={`text-3xl font-black text-right ${color}`}>{value ?? '—'}</p>
        </div>
    );
}
