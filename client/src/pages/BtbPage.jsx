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

// תווית זיהוי של צופה — טלפון/שם, או "לא זוהה" אם זה LID שלא מופה
const viewerLabel = (v) => v.name || v.phone || 'לא זוהה';

// ─── כרטיסיית סטטוס ───────────────────────────────────────────────
function StatusCard({ s, onClick }) {
    return (
        <button onClick={onClick} className="group text-right rounded-xl overflow-hidden border border-gray-100 bg-white hover:shadow-md transition">
            <div className="relative bg-gray-100 flex items-center justify-center overflow-hidden" style={{ aspectRatio: '9 / 16' }}>
                {s.thumbnail
                    ? <img src={s.thumbnail} alt="" className="w-full h-full object-cover" />
                    : s.mediaType === 'text'
                        ? <div className="w-full h-full flex items-center justify-center p-3 text-white text-xs text-center leading-snug"
                            style={{ backgroundColor: s.bgColor || BTB.color }}>{s.caption || 'טקסט'}</div>
                        : <span className="text-4xl opacity-60">{MEDIA_ICON[s.mediaType] || '❓'}</span>}

                <span className="absolute top-1.5 right-1.5 text-sm drop-shadow">{MEDIA_ICON[s.mediaType]}</span>
                <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent text-white text-xs px-2 py-1.5 font-semibold">
                    👁 {s.viewsCount}
                </span>
            </div>
            <div className="px-2 py-1.5">
                <p className="text-[11px] text-gray-400">{fmtDate(s.postedAt)}</p>
            </div>
        </button>
    );
}

// ─── הדף הראשי ────────────────────────────────────────────────────
export default function BtbPage() {
    const [accounts, setAccounts] = useState(null);
    const [activeId, setActiveId] = useState(null);
    const [stats, setStats]       = useState(null);
    const [statuses, setStatuses] = useState([]);
    const [viewers, setViewers]   = useState([]);
    const [qrOpen, setQrOpen]     = useState(false);
    const [qrImg, setQrImg]       = useState(null);
    const [selStatus, setSelStatus] = useState(null);
    const [selViewers, setSelViewers] = useState(null);
    const [resolving, setResolving]   = useState(false);

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

    const pollQR = useCallback(async () => {
        try {
            const res = await api.get(`/btb/${activeId}/qr`);
            if (res.data.connected) { setQrOpen(false); fetchAccounts(); }
            else if (res.data.qr) setQrImg(res.data.qr);
        } catch { /* ה-interval ינסה שוב */ }
    }, [activeId, fetchAccounts]);

    const openQR = () => { setQrImg(null); setQrOpen(true); pollQR(); };

    // ריענון ה-QR כל עוד המודאל פתוח (וואטסאפ מחליף קוד כל ~20ש'); סגירה אוטומטית בחיבור
    useEffect(() => {
        if (!qrOpen) return;
        if (account?.waStatus === 'connected') { setQrOpen(false); return; }
        const iv = setInterval(pollQR, 15000);
        return () => clearInterval(iv);
    }, [qrOpen, account?.waStatus, pollQR]);

    const reconnect = async () => { await api.post(`/btb/${activeId}/reconnect`); fetchAccounts(); };

    const openViewers = async (s) => {
        setSelStatus(s); setSelViewers(null);
        try { setSelViewers((await api.get(`/btb/${activeId}/statuses/${s._id}/viewers`)).data); }
        catch { setSelViewers([]); }
    };

    const resolveViewers = async () => {
        setResolving(true);
        try {
            const res = await api.post(`/btb/${activeId}/resolve-viewers`);
            await fetchDetail(activeId);
            alert(`זוהו ${res.data.resolved} מתוך ${res.data.checked} צופים שלא היו מזוהים`);
        } catch { alert('שגיאה בזיהוי'); }
        finally { setResolving(false); }
    };

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

                {/* status cards */}
                <h2 className="text-sm font-semibold text-gray-500 mb-3">סטטוסים — לחץ לצפייה במי שצפה</h2>
                {statuses.length === 0
                    ? <div className="bg-white rounded-xl border border-gray-100 p-8 text-sm text-gray-400 text-center mb-8">עדיין אין סטטוסים. העלה סטטוס מהטלפון וצפה כאן.</div>
                    : <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-8">
                        {statuses.map(s => <StatusCard key={s._id} s={s} onClick={() => openViewers(s)} />)}
                    </div>}

                {/* core followers */}
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-gray-500">גרעין העוקבים <span className="font-normal text-gray-400">(לפי כמות סטטוסים שנצפו)</span></h2>
                    <button onClick={resolveViewers} disabled={resolving}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50">
                        {resolving ? 'מזהה…' : '🔄 זהה צופים לא מזוהים'}
                    </button>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
                    {viewers.length === 0 && <p className="p-4 text-sm text-gray-400 text-center">עדיין אין צפיות מתועדות.</p>}
                    {viewers.map((v, i) => (
                        <div key={v.viewerJid} className="flex items-center justify-between px-4 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-xs text-gray-300 w-5 text-center">{i + 1}</span>
                                <span dir="ltr" className={`text-sm truncate ${v.phone || v.name ? 'text-[#111b21]' : 'text-gray-400 italic'}`}>{viewerLabel(v)}</span>
                            </div>
                            <span className="text-sm font-semibold flex-shrink-0" style={{ color: BTB.color }}>{v.statusesViewed}</span>
                        </div>
                    ))}
                </div>
            </div>

            {selStatus && (
                <Modal onClose={() => setSelStatus(null)}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-16 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">
                            {selStatus.thumbnail
                                ? <img src={selStatus.thumbnail} alt="" className="w-full h-full object-cover" />
                                : <span className="text-xl" style={selStatus.mediaType === 'text' ? { color: '#fff' } : {}}>{MEDIA_ICON[selStatus.mediaType]}</span>}
                        </div>
                        <div>
                            <p className="font-bold text-[#111b21]">צפו בסטטוס</p>
                            <p className="text-xs text-gray-400">{fmtDate(selStatus.postedAt)} · 👁 {selStatus.viewsCount}</p>
                        </div>
                    </div>
                    <div className="max-h-80 overflow-auto -mx-2">
                        {selViewers === null
                            ? <p className="p-4 text-sm text-gray-400 text-center">טוען…</p>
                            : selViewers.length === 0
                                ? <p className="p-4 text-sm text-gray-400 text-center">אין צפיות מתועדות לסטטוס זה.</p>
                                : selViewers.map((v, i) => (
                                    <div key={v.viewerJid} className="flex items-center justify-between px-2 py-2 border-b border-gray-50 last:border-0">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <span className="text-xs text-gray-300 w-5 text-center">{i + 1}</span>
                                            <span dir="ltr" className={`text-sm truncate ${v.phone || v.name ? 'text-[#111b21]' : 'text-gray-400 italic'}`}>{viewerLabel(v)}</span>
                                        </div>
                                        <span className="text-xs text-gray-400 flex-shrink-0">{fmtDate(v.viewedAt)}</span>
                                    </div>
                                ))}
                    </div>
                </Modal>
            )}

            {qrOpen && (
                <Modal onClose={() => setQrOpen(false)}>
                    <div className="text-center">
                        <p className="text-lg font-bold mb-1 text-[#111b21]">{account?.name}</p>
                        <p className="text-sm text-[#8696a0] mb-5">סרוק עם וואטסאפ — הקוד מתרענן אוטומטית</p>
                        {qrImg
                            ? <img src={qrImg} alt="QR" className="mx-auto w-60 h-60 rounded-xl" />
                            : <div className="w-60 h-60 mx-auto flex items-center justify-center text-gray-400">טוען QR…</div>}
                        <p className="text-xs text-[#8696a0] mt-4">וואטסאפ ← מכשירים מקושרים ← קשר מכשיר</p>
                    </div>
                </Modal>
            )}
        </div>
    );
}
