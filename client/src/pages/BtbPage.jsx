import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/services/api';
import { useSSE } from '@/hooks/useSSE';
import Modal from '@/components/ui/Modal';
import StatusUploadModal from '@/components/btb/StatusUploadModal';
import { SERVICES } from '@/config/services';
import { useAuthStore } from '@/stores/authStore';

const BTB = SERVICES.btb;

const WA_BADGE = {
    connected:   { label: 'מחובר',     cls: 'bg-green-100 text-green-700' },
    connecting:  { label: 'מתחבר…',    cls: 'bg-yellow-100 text-yellow-700' },
    waiting_qr:  { label: 'ממתין ל-QR', cls: 'bg-yellow-100 text-yellow-700' },
    disconnected:{ label: 'מנותק',     cls: 'bg-red-100 text-red-600' },
};

const MEDIA_ICON = { image: '🖼️', video: '🎬', text: '📝', unknown: '🕓' };

function fmtDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return `${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
}

function fmtBytes(b) {
    if (b == null) return '—';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

// fps מגיע כ-"30/1" — מצמצמים למספר
function fmtFps(s) {
    if (!s) return null;
    const [n, d] = String(s).split('/').map(Number);
    return d ? `${Math.round(n / d)}` : String(s);
}

// ─── בדיקת איכות: השוואת ספק המדיה בכל שלב (מקור → נשלח → וואטסאפ) ──
function ProbeReport({ probe }) {
    if (!probe || (!probe.sent && !probe.original)) return null;
    const kind = probe.sent?.kind || probe.original?.kind || probe.roundtrip?.kind;
    const stages = [
        { key: 'original',  label: 'מקור',    p: probe.original,  bytes: probe.originalBytes },
        { key: 'sent',      label: 'נשלח',    p: probe.sent,      bytes: probe.sentBytes },
        { key: 'roundtrip', label: 'וואטסאפ', p: probe.roundtrip, bytes: probe.roundtripBytes },
    ];
    const metrics = kind === 'image'
        ? [
            ['פורמט',   p => p?.format],
            ['רזולוציה', p => (p?.width && p?.height) ? `${p.width}×${p.height}` : null],
            ['Chroma',  p => p?.chromaSubsampling],
            ['מרחב צבע', p => p?.space],
        ]
        : [
            ['קודק',     p => p?.video?.codec ? `${p.video.codec} ${p.video.profile || ''}`.trim() : null],
            ['רזולוציה', p => (p?.video?.width && p?.video?.height) ? `${p.video.width}×${p.video.height}` : null],
            ['FPS',      p => fmtFps(p?.video?.fps)],
            ['Bitrate',  p => p?.video?.bitrate || p?.totalBitrate],
            ['עומק/פיקסל', p => [p?.video?.pixFmt, p?.video?.bitsPerRawSample ? `${p.video.bitsPerRawSample}-bit` : null].filter(Boolean).join(' · ') || null],
            ['Transfer', p => p?.video?.colorTransfer],
            ['Primaries', p => p?.video?.colorPrimaries],
            ['מרחב/טווח', p => [p?.video?.colorSpace, p?.video?.colorRange].filter(Boolean).join(' · ') || null],
            ['HDR',       p => p?.video?.hdr === true ? 'כן' : (p?.video?.hdr === false ? 'לא' : null)],
            ['משך',      p => p?.durationSec ? `${p.durationSec.toFixed(1)}s` : null],
        ];
    const cell = (val, stageKey) => val || (stageKey === 'roundtrip' ? '…' : '—');

    return (
        <div className="mb-4 rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-500">בדיקת איכות — מה וואטסאפ שינתה</div>
            <table className="w-full text-xs">
                <thead>
                    <tr className="text-gray-400">
                        <th className="px-3 py-1.5"></th>
                        {stages.map(s => <th key={s.key} className="text-right font-medium px-3 py-1.5">{s.label}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {metrics.map(([label, get]) => (
                        <tr key={label} className="border-t border-gray-50">
                            <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap">{label}</td>
                            {stages.map(s => <td key={s.key} dir="ltr" className="px-3 py-1.5 text-right text-[#111b21]">{cell(get(s.p), s.key)}</td>)}
                        </tr>
                    ))}
                    <tr className="border-t border-gray-50 font-semibold">
                        <td className="px-3 py-1.5 text-gray-400">גודל</td>
                        {stages.map(s => <td key={s.key} dir="ltr" className="px-3 py-1.5 text-right text-[#111b21]">{s.bytes != null ? fmtBytes(s.bytes) : (s.key === 'roundtrip' ? '…' : '—')}</td>)}
                    </tr>
                </tbody>
            </table>
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

// תווית זיהוי של צופה — שם שמור (מועדף), אחרת pushName, אחרת טלפון, אחרת "לא זוהה"
const viewerLabel = (v) => v.name || v.pushName || v.phone || 'לא זוהה';

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

// ─── דשבורד של חשבון בודד — משמש גם את הלקוח (הכניסה שלו) וגם את ─────
// המנהל (drill-in מתוך קונסולת הלקוחות). admin מקבל ניהול חיבור + back.
export default function BtbPage() {
    const user   = useAuthStore(s => s.user);
    const logout = useAuthStore(s => s.logout);
    const isClient = user?.role === 'client';
    const isAdmin  = !isClient;

    const params = useParams();
    const navigate = useNavigate();
    const accountId = isClient ? user?.btbAccountId : params.id;

    const [account, setAccount]   = useState(undefined); // undefined=טוען, null=לא נמצא
    const [stats, setStats]       = useState(null);
    const [statuses, setStatuses] = useState([]);
    const [viewers, setViewers]   = useState([]);
    const [qrOpen, setQrOpen]     = useState(false);
    const [qrImg, setQrImg]       = useState(null);
    const [selStatus, setSelStatus]   = useState(null);
    const [selViewers, setSelViewers] = useState(null);
    const [showUpload, setShowUpload] = useState(false);
    const [test, setTest] = useState(null);
    const testInput = useRef(null);

    const fetchMeta = useCallback(async () => {
        if (!accountId) return;
        try { setAccount((await api.get(`/btb/${accountId}`)).data); }
        catch { setAccount(null); }
    }, [accountId]);

    const fetchDetail = useCallback(async () => {
        if (!accountId) return;
        try {
            const [s, st, v] = await Promise.all([
                api.get(`/btb/${accountId}/stats`),
                api.get(`/btb/${accountId}/statuses?limit=50`),
                api.get(`/btb/${accountId}/top-viewers?limit=100`),
            ]);
            setStats(s.data); setStatuses(st.data); setViewers(v.data);
        } catch { /* ה-SSE/ריענון הבא ינסה שוב */ }
    }, [accountId]);

    useEffect(() => { fetchMeta(); fetchDetail(); }, [fetchMeta, fetchDetail]);
    useSSE(() => { fetchMeta(); fetchDetail(); });

    // שמירה על סנכרון הסטטוס הפתוח במודאל כשהרשימה מתרעננת (דוח איכות מ-SSE)
    useEffect(() => {
        setSelStatus(prev => prev ? (statuses.find(s => s._id === prev._id) || prev) : prev);
    }, [statuses]);

    const pollQR = useCallback(async () => {
        try {
            const res = await api.get(`/btb/${accountId}/qr`);
            if (res.data.connected) { setQrOpen(false); fetchMeta(); }
            else if (res.data.qr) setQrImg(res.data.qr);
        } catch { /* ה-interval ינסה שוב */ }
    }, [accountId, fetchMeta]);

    const openQR = () => { setQrImg(null); setQrOpen(true); pollQR(); };

    useEffect(() => {
        if (!qrOpen) return;
        if (account?.waStatus === 'connected') { setQrOpen(false); return; }
        const iv = setInterval(pollQR, 15000);
        return () => clearInterval(iv);
    }, [qrOpen, account?.waStatus, pollQR]);

    const reconnect = async () => { await api.post(`/btb/${accountId}/reconnect`); fetchMeta(); };

    const runTest = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const type = file.type.startsWith('video') ? 'video' : 'image';
        setTest({ busy: true, type });
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('type', type);
            const { data } = await api.post(`/btb/${accountId}/status-test`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            const testId = data.testId;
            const deadline = Date.now() + 180_000;
            while (Date.now() < deadline) {
                await new Promise(r => setTimeout(r, 2000));
                const job = (await api.get(`/btb/${accountId}/status-test/${testId}`)).data;
                if (job.status === 'done')  { setTest({ result: job.result }); return; }
                if (job.status === 'error') { setTest({ error: job.error }); return; }
                if (job.status === 'notfound') { setTest({ error: 'הבדיקה אבדה (השרת אותחל?)' }); return; }
            }
            setTest({ error: 'הבדיקה לא הסתיימה בזמן' });
        } catch (err) {
            setTest({ error: err.response?.data?.error || 'הבדיקה נכשלה' });
        }
    };

    const openViewers = async (s) => {
        setSelStatus(s); setSelViewers(null);
        try { setSelViewers((await api.get(`/btb/${accountId}/statuses/${s._id}/viewers`)).data); }
        catch { setSelViewers([]); }
    };

    // לקוח בלי חשבון משויך
    if (isClient && !accountId) return (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-500 bg-gray-50 px-6 text-center">
            <p>החשבון שלך עדיין לא הוגדר. פנה למנהל המערכת.</p>
            <button onClick={logout} className="text-sm text-gray-400 hover:text-[#111b21]">התנתק</button>
        </div>
    );
    if (account === undefined) return (
        <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50">טוען…</div>
    );
    if (account === null) return (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-500 bg-gray-50 px-6 text-center">
            <p>החשבון לא נמצא.</p>
            {isAdmin && <button onClick={() => navigate('/btb')} className="text-sm" style={{ color: BTB.color }}>← חזרה ללקוחות</button>}
        </div>
    );

    const badge = WA_BADGE[account?.waStatus] || WA_BADGE.disconnected;
    const target = stats?.targetFollowers || account?.targetFollowers || 1000;
    const pct = stats ? Math.min(100, Math.round((stats.uniqueViewers / target) * 100)) : 0;

    return (
        <div className="h-full overflow-auto bg-gray-50">
            <div className="max-w-5xl mx-auto px-6 py-8">
                {/* back (admin) */}
                {isAdmin && (
                    <button onClick={() => navigate('/btb')} className="text-sm text-gray-400 hover:text-[#111b21] mb-3">← כל הלקוחות</button>
                )}

                {/* header */}
                <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-xl font-bold text-[#111b21]">{account?.name}</h1>
                        <span dir="ltr" className="text-sm text-gray-400">{account?.phone}</span>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
                        {isAdmin && account?.client?.email && (
                            <span dir="ltr" className="text-xs text-gray-400">· {account.client.email}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {account?.waStatus === 'connected' && (
                            <button onClick={() => setShowUpload(true)} className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                                style={{ backgroundColor: BTB.accent }}>＋ העלה סטטוס</button>
                        )}

                        {/* ניהול חיבור — אדמין בלבד */}
                        {isAdmin && account?.waStatus === 'connected' && (
                            <>
                                <button onClick={() => testInput.current?.click()} title="העלאה→הורדה→מחיקה אוטומטית עם דוח איכות"
                                    className="px-3.5 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-100">🔬 בדיקת איכות</button>
                                <input ref={testInput} type="file" accept="image/*,video/*" className="hidden" onChange={runTest} />
                            </>
                        )}
                        {isAdmin && account?.waStatus !== 'connected' && (
                            <button onClick={openQR} className="px-3.5 py-2 rounded-lg text-sm font-medium text-white"
                                style={{ backgroundColor: BTB.color }}>חבר / QR</button>
                        )}
                        {isAdmin && <button onClick={reconnect} className="px-3.5 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">חיבור מחדש</button>}

                        {/* לקוח */}
                        {isClient && account?.waStatus !== 'connected' && (
                            <span className="text-sm text-amber-600">ממתין לחיבור הוואטסאפ ע״י המנהל</span>
                        )}
                        {isClient && <button onClick={logout} className="px-3.5 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100">התנתק</button>}
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
                    ? <div className="bg-white rounded-xl border border-gray-100 p-8 text-sm text-gray-400 text-center mb-8">עדיין אין סטטוסים. העלה סטטוס וצפה כאן.</div>
                    : <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-8">
                        {statuses.map(s => <StatusCard key={s._id} s={s} onClick={() => openViewers(s)} />)}
                    </div>}

                {/* core followers */}
                <h2 className="text-sm font-semibold text-gray-500 mb-3">גרעין העוקבים <span className="font-normal text-gray-400">(לפי כמות סטטוסים שנצפו)</span></h2>
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

            {showUpload && (
                <StatusUploadModal
                    accountId={accountId}
                    onClose={() => setShowUpload(false)}
                    onPosted={(r) => { fetchDetail(); alert(`פורסם ${r.count} סטטוס(ים) ל-${r.recipients} אנשי קשר`); }}
                />
            )}

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
                    {isAdmin && <ProbeReport probe={selStatus.mediaProbe} />}
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

            {test && (
                <Modal onClose={() => { if (!test.busy) setTest(null); }}>
                    <p className="font-bold text-[#111b21] mb-1">בדיקת איכות</p>
                    {test.busy && (
                        <div className="py-8 text-center text-sm text-gray-500">
                            <div className="text-3xl mb-3 animate-pulse">🔬</div>
                            מעלה לסטטוס, מוריד בחזרה ומוחק…
                            <p className="text-xs text-gray-400 mt-1">{test.type === 'video' ? 'וידאו עשוי לקחת מספר שניות לקידוד' : ''}</p>
                        </div>
                    )}
                    {test.error && <p className="py-6 text-sm text-red-600 text-center">{test.error}</p>}
                    {test.result && (
                        <>
                            <p className="text-xs text-gray-400 mb-3">
                                {test.result.deleted ? '✓ סטטוס הבדיקה נמחק' : '⚠ מחיקת הסטטוס נכשלה — בדוק ידנית'}
                                {test.result.segmentCount > 1 && ` · נבדק מקטע 1 מתוך ${test.result.segmentCount}`}
                            </p>
                            {test.result.roundtripError && (
                                <p className="text-xs text-amber-600 mb-3">⚠ ההורדה בחזרה נכשלה: {test.result.roundtripError} — מוצגים מקור + נשלח בלבד.</p>
                            )}
                            <ProbeReport probe={test.result.probe} />
                            <button onClick={() => setTest(null)} className="w-full py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: BTB.color }}>סגור</button>
                        </>
                    )}
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
