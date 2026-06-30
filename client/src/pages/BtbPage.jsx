import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';
import { useSSE } from '@/hooks/useSSE';
import Modal from '@/components/ui/Modal';
import { SERVICES } from '@/config/services';

const BTB = SERVICES.btb;

const WA_BADGE = {
    connected:   { label: 'מחובר',     cls: 'bg-green-100 text-green-700' },
    connecting:  { label: 'מתחבר…',    cls: 'bg-yellow-100 text-yellow-700' },
    waiting_qr:  { label: 'ממתין ל-QR', cls: 'bg-yellow-100 text-yellow-700' },
    disconnected:{ label: 'מנותק',     cls: 'bg-red-100 text-red-600' },
};

const MEDIA_ICON = { image: '🖼️', video: '🎬', text: '📝' };

function fmtDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return `${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
}

// ─── טופס יצירת חשבון ─────────────────────────────────────────────
function CreateAccount({ onCreated }) {
    const [name, setName]   = useState('');
    const [phone, setPhone] = useState('');
    const [busy, setBusy]   = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!name || !phone) return;
        setBusy(true);
        try {
            const res = await api.post('/btb', { name, phone });
            onCreated(res.data._id);
        } catch (err) {
            alert(err.response?.data?.error || 'שגיאה ביצירת חשבון');
        } finally { setBusy(false); }
    };

    return (
        <div className="h-full flex items-center justify-center bg-gray-50 px-6">
            <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-7">
                <div className="w-14 h-14 rounded-xl flex items-center justify-center font-black text-white text-xl mb-5"
                    style={{ backgroundColor: BTB.color }}>
                    <span style={{ color: BTB.accent }}>B</span>TB
                </div>
                <h2 className="text-lg font-bold text-[#111b21] mb-1">חיבור חשבון סטטוסים</h2>
                <p className="text-sm text-gray-500 mb-5">צור חשבון וחבר אותו לוואטסאפ כדי להתחיל לתעד צפיות.</p>

                <label className="block text-sm font-medium text-[#111b21] mb-1">שם העסק</label>
                <input value={name} onChange={e => setName(e.target.value)}
                    className="w-full mb-4 px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200" />

                <label className="block text-sm font-medium text-[#111b21] mb-1">מספר טלפון</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9725XXXXXXXX" dir="ltr"
                    className="w-full mb-5 px-3 py-2 rounded-lg border border-gray-200 text-right focus:outline-none focus:ring-2 focus:ring-blue-200" />

                <button type="submit" disabled={busy}
                    className="w-full py-2.5 rounded-lg text-white font-semibold transition disabled:opacity-50"
                    style={{ backgroundColor: BTB.color }}>
                    {busy ? 'יוצר…' : 'צור וחבר'}
                </button>
            </form>
        </div>
    );
}

// ─── כרטיס מדד ────────────────────────────────────────────────────
function Metric({ label, value, sub }) {
    return (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-2xl font-bold text-[#111b21]">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
    );
}

// ─── הדף הראשי ────────────────────────────────────────────────────
export default function BtbPage() {
    const [accounts, setAccounts] = useState(null);
    const [activeId, setActiveId] = useState(null);
    const [stats, setStats]       = useState(null);
    const [statuses, setStatuses] = useState([]);
    const [viewers, setViewers]   = useState([]);
    const [qrModal, setQrModal]   = useState(null);

    const fetchAccounts = useCallback(async () => {
        const res = await api.get('/btb');
        setAccounts(res.data);
        setActiveId(prev => prev || res.data[0]?._id || null);
    }, []);

    const fetchDetail = useCallback(async (id) => {
        if (!id) return;
        const [s, st, v] = await Promise.all([
            api.get(`/btb/${id}/stats`),
            api.get(`/btb/${id}/statuses?limit=50`),
            api.get(`/btb/${id}/top-viewers?limit=100`),
        ]);
        setStats(s.data); setStatuses(st.data); setViewers(v.data);
    }, []);

    useEffect(() => { fetchAccounts(); }, [fetchAccounts]);
    useEffect(() => { fetchDetail(activeId); }, [activeId, fetchDetail]);
    useSSE(() => { fetchAccounts(); fetchDetail(activeId); });

    const account = accounts?.find(a => a._id === activeId);

    const openQR = async () => {
        setQrModal({ loading: true, name: account?.name });
        try {
            const res = await api.get(`/btb/${activeId}/qr`);
            if (res.data.connected) { setQrModal(null); fetchAccounts(); }
            else setQrModal({ qr: res.data.qr, name: account?.name });
        } catch {
            setQrModal(null);
            alert('לא התקבל QR — נסה שוב');
        }
    };

    const reconnect = async () => { await api.post(`/btb/${activeId}/reconnect`); fetchAccounts(); };

    if (accounts === null) return (
        <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50">טוען…</div>
    );
    if (accounts.length === 0) return <CreateAccount onCreated={(id) => { setActiveId(id); fetchAccounts(); }} />;

    const badge = WA_BADGE[account?.waStatus] || WA_BADGE.disconnected;
    const target = stats?.targetFollowers || 1000;
    const pct = stats ? Math.min(100, Math.round((stats.uniqueViewers / target) * 100)) : 0;

    return (
        <div className="h-full overflow-auto bg-gray-50">
            <div className="max-w-5xl mx-auto px-6 py-8">
                {/* header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl font-bold text-[#111b21]">{account?.name}</h1>
                        <span dir="ltr" className="text-sm text-gray-400">{account?.phone}</span>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {account?.waStatus !== 'connected' && (
                            <button onClick={openQR} className="px-3.5 py-2 rounded-lg text-sm font-medium text-white"
                                style={{ backgroundColor: BTB.color }}>חבר / QR</button>
                        )}
                        <button onClick={reconnect} className="px-3.5 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">חיבור מחדש</button>
                    </div>
                </div>

                {/* metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <Metric label="סטטוסים" value={stats?.totalStatuses ?? '—'} />
                    <Metric label="צופים ייחודיים" value={stats?.uniqueViewers ?? '—'} sub={`יעד: ${target.toLocaleString()}`} />
                    <Metric label="סך צפיות" value={stats?.totalViews ?? '—'} />
                    <Metric label="התקדמות ליעד" value={`${pct}%`} sub={stats?.targetReached ? '🎯 היעד הושג!' : ''} />
                </div>

                {/* progress bar */}
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden mb-8">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: BTB.accent }} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* statuses */}
                    <div>
                        <h2 className="text-sm font-semibold text-gray-500 mb-2">סטטוסים אחרונים</h2>
                        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50 max-h-96 overflow-auto">
                            {statuses.length === 0 && <p className="p-4 text-sm text-gray-400 text-center">עדיין אין סטטוסים. העלה סטטוס מהטלפון וצפה כאן.</p>}
                            {statuses.map(s => (
                                <div key={s._id} className="flex items-center justify-between px-4 py-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span>{MEDIA_ICON[s.mediaType] || '❓'}</span>
                                        <span className="text-sm text-[#111b21] truncate">{s.caption || s.mediaType}</span>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <span className="text-xs text-gray-400">{fmtDate(s.postedAt)}</span>
                                        <span className="text-sm font-semibold" style={{ color: BTB.color }}>👁 {s.viewsCount}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* viewers */}
                    <div>
                        <h2 className="text-sm font-semibold text-gray-500 mb-2">גרעין העוקבים (לפי כמות סטטוסים שנצפו)</h2>
                        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50 max-h-96 overflow-auto">
                            {viewers.length === 0 && <p className="p-4 text-sm text-gray-400 text-center">עדיין אין צפיות מתועדות.</p>}
                            {viewers.map((v, i) => (
                                <div key={v.viewerJid} className="flex items-center justify-between px-4 py-2.5">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="text-xs text-gray-300 w-5 text-center">{i + 1}</span>
                                        <span dir="ltr" className="text-sm text-[#111b21] truncate">{v.name || v.phone || v.viewerJid}</span>
                                    </div>
                                    <span className="text-sm font-semibold flex-shrink-0" style={{ color: BTB.color }}>{v.statusesViewed}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {qrModal && (
                <Modal onClose={() => setQrModal(null)}>
                    <div className="text-center">
                        <p className="text-lg font-bold mb-1 text-[#111b21]">{qrModal.name}</p>
                        <p className="text-sm text-[#8696a0] mb-5">סרוק עם וואטסאפ</p>
                        {qrModal.loading
                            ? <div className="w-60 h-60 mx-auto flex items-center justify-center text-gray-400">טוען QR…</div>
                            : <img src={qrModal.qr} alt="QR" className="mx-auto w-60 h-60 rounded-xl" />}
                        <p className="text-xs text-[#8696a0] mt-4">וואטסאפ ← מכשירים מקושרים ← קשר מכשיר</p>
                    </div>
                </Modal>
            )}
        </div>
    );
}
