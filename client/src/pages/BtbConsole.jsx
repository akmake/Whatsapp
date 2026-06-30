import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/services/api';
import { useSSE } from '@/hooks/useSSE';
import Modal from '@/components/ui/Modal';
import { SERVICES } from '@/config/services';

const BTB = SERVICES.btb;

const WA = {
    connected:    { label: 'מחובר',     cls: 'bg-green-100 text-green-700' },
    connecting:   { label: 'מתחבר…',    cls: 'bg-yellow-100 text-yellow-700' },
    waiting_qr:   { label: 'ממתין ל-QR', cls: 'bg-yellow-100 text-yellow-700' },
    disconnected: { label: 'מנותק',     cls: 'bg-red-100 text-red-600' },
};

const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

// ─── טופס לקוח חדש ────────────────────────────────────────────────
function CreateAccount({ onClose, onCreated }) {
    const [name, setName]   = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy]   = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!name || !phone) return;
        setBusy(true);
        try {
            const res = await api.post('/btb', { name, phone, email: email.trim(), password });
            onCreated(res.data._id);
        } catch (err) {
            alert(err.response?.data?.error || 'שגיאה ביצירת לקוח');
        } finally { setBusy(false); }
    };

    return (
        <Modal onClose={onClose}>
            <form onSubmit={submit}>
                <h2 className="text-lg font-bold text-[#111b21] mb-1">לקוח חדש</h2>
                <p className="text-sm text-gray-500 mb-5">צור חשבון ופרטי כניסה. אחרי היצירה תחבר את הוואטסאפ שלו ב-QR מתוך הכרטיס.</p>

                <label className="block text-sm font-medium text-[#111b21] mb-1">שם העסק</label>
                <input value={name} onChange={e => setName(e.target.value)} autoFocus
                    className="w-full mb-4 px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200" />

                <label className="block text-sm font-medium text-[#111b21] mb-1">מספר טלפון</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9725XXXXXXXX" dir="ltr"
                    className="w-full mb-4 px-3 py-2 rounded-lg border border-gray-200 text-right focus:outline-none focus:ring-2 focus:ring-blue-200" />

                <div className="border-t border-gray-100 pt-4 mt-1">
                    <p className="text-xs font-semibold text-gray-400 mb-2">פרטי כניסה ללקוח (אופציונלי — אפשר להוסיף אחר כך)</p>
                    <label className="block text-sm font-medium text-[#111b21] mb-1">אימייל</label>
                    <input value={email} onChange={e => setEmail(e.target.value)} type="email" dir="ltr" placeholder="client@example.com"
                        className="w-full mb-4 px-3 py-2 rounded-lg border border-gray-200 text-right focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    <label className="block text-sm font-medium text-[#111b21] mb-1">סיסמה (לפחות 8 תווים)</label>
                    <input value={password} onChange={e => setPassword(e.target.value)} type="text" dir="ltr"
                        className="w-full mb-5 px-3 py-2 rounded-lg border border-gray-200 text-right focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </div>

                <button type="submit" disabled={busy}
                    className="w-full py-2.5 rounded-lg text-white font-semibold transition disabled:opacity-50"
                    style={{ backgroundColor: BTB.color }}>
                    {busy ? 'יוצר…' : 'צור לקוח'}
                </button>
            </form>
        </Modal>
    );
}

// ─── ניהול כניסת לקוח: יצירה / איפוס סיסמה / השבתה ────────────────
function ClientLoginModal({ account, onClose, onSaved }) {
    const existing = account.client;
    const [email, setEmail] = useState(existing?.email || '');
    const [password, setPassword] = useState('');
    const [active, setActive] = useState(existing?.active ?? true);
    const [busy, setBusy] = useState(false);

    const save = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const body = { active };
            if (email.trim()) body.email = email.trim();
            if (password) body.password = password;
            await api.put(`/btb/${account._id}/client`, body);
            onSaved();
        } catch (err) {
            alert(err.response?.data?.error || 'שגיאה בשמירת הכניסה');
        } finally { setBusy(false); }
    };

    return (
        <Modal onClose={onClose}>
            <form onSubmit={save}>
                <h2 className="text-lg font-bold text-[#111b21] mb-1">כניסת לקוח — {account.name}</h2>
                <p className="text-sm text-gray-500 mb-5">
                    {existing ? 'עדכן אימייל, אפס סיסמה או השבת גישה.' : 'צור פרטי כניסה ללקוח הזה.'}
                </p>

                <label className="block text-sm font-medium text-[#111b21] mb-1">אימייל</label>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" dir="ltr" placeholder="client@example.com"
                    className="w-full mb-4 px-3 py-2 rounded-lg border border-gray-200 text-right focus:outline-none focus:ring-2 focus:ring-blue-200" />

                <label className="block text-sm font-medium text-[#111b21] mb-1">
                    {existing ? 'סיסמה חדשה (השאר ריק כדי לא לשנות)' : 'סיסמה (לפחות 8 תווים)'}
                </label>
                <input value={password} onChange={e => setPassword(e.target.value)} type="text" dir="ltr"
                    className="w-full mb-4 px-3 py-2 rounded-lg border border-gray-200 text-right focus:outline-none focus:ring-2 focus:ring-blue-200" />

                {existing && (
                    <label className="flex items-center gap-2 mb-5 text-sm text-[#111b21]">
                        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                        כניסה פעילה (בטל סימון כדי לחסום גישה ללקוח)
                    </label>
                )}

                <button type="submit" disabled={busy}
                    className="w-full py-2.5 rounded-lg text-white font-semibold transition disabled:opacity-50"
                    style={{ backgroundColor: BTB.color }}>
                    {busy ? 'שומר…' : 'שמור'}
                </button>
            </form>
        </Modal>
    );
}

// ─── קונסולת לקוחות (מסך הניהול הראשי של המנהל) ───────────────────
export default function BtbConsole() {
    const navigate = useNavigate();
    const [accounts, setAccounts] = useState(null);
    const [q, setQ] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [loginFor, setLoginFor] = useState(null);

    const load = useCallback(async () => {
        try { setAccounts((await api.get('/btb')).data); } catch { setAccounts([]); }
    }, []);
    useEffect(() => { load(); }, [load]);
    useSSE(load);

    const del = async (a) => {
        if (!confirm(`למחוק את "${a.name}" וכל הנתונים והכניסה שלו? פעולה בלתי הפיכה.`)) return;
        try { await api.delete(`/btb/${a._id}`); load(); }
        catch (err) { alert(err.response?.data?.error || 'שגיאה במחיקה'); }
    };

    const filtered = (accounts || []).filter(a => {
        const s = q.trim().toLowerCase();
        if (!s) return true;
        return [a.name, a.phone, a.client?.email].filter(Boolean).some(x => String(x).toLowerCase().includes(s));
    });

    if (accounts === null) return (
        <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50">טוען…</div>
    );

    return (
        <div className="h-full overflow-auto bg-gray-50">
            <div className="max-w-5xl mx-auto px-6 py-8">
                {/* header */}
                <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
                    <div>
                        <h1 className="text-xl font-bold text-[#111b21]">הלקוחות שלי</h1>
                        <p className="text-sm text-gray-400">{accounts.length} לקוחות · {accounts.filter(a => a.waStatus === 'connected').length} מחוברים</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש לפי שם / טלפון / אימייל"
                            className="px-3 py-2 rounded-lg border border-gray-200 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                        <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-lg text-sm font-semibold text-white whitespace-nowrap"
                            style={{ backgroundColor: BTB.color }}>＋ לקוח חדש</button>
                    </div>
                </div>

                {/* empty */}
                {filtered.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400">
                        {accounts.length === 0 ? 'עדיין אין לקוחות. צור את הראשון עם "＋ לקוח חדש".' : 'אין תוצאות לחיפוש.'}
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-gray-400 text-xs">
                                <tr>
                                    <th className="text-right font-medium px-4 py-2.5">עסק</th>
                                    <th className="text-right font-medium px-4 py-2.5">טלפון</th>
                                    <th className="text-right font-medium px-4 py-2.5">חיבור</th>
                                    <th className="text-right font-medium px-4 py-2.5">כניסת לקוח</th>
                                    <th className="text-right font-medium px-4 py-2.5">נוצר</th>
                                    <th className="px-4 py-2.5"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map(a => {
                                    const badge = WA[a.waStatus] || WA.disconnected;
                                    return (
                                        <tr key={a._id} className="hover:bg-gray-50/70 transition cursor-pointer" onClick={() => navigate(`/btb/${a._id}`)}>
                                            <td className="px-4 py-3 font-semibold text-[#111b21]">{a.name}</td>
                                            <td className="px-4 py-3 text-gray-500" dir="ltr">{a.phone}</td>
                                            <td className="px-4 py-3"><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>{badge.label}</span></td>
                                            <td className="px-4 py-3" dir="ltr">
                                                {a.client
                                                    ? <span className={a.client.active ? 'text-[#111b21]' : 'text-red-500 line-through'}>{a.client.email}</span>
                                                    : <span className="text-gray-300 italic">אין כניסה</span>}
                                            </td>
                                            <td className="px-4 py-3 text-gray-400">{fmtDate(a.createdAt)}</td>
                                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button onClick={() => navigate(`/btb/${a._id}`)}
                                                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: BTB.accent }}>נהל</button>
                                                    <button onClick={() => setLoginFor(a)}
                                                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-100">
                                                        {a.client ? 'כניסה' : 'צור כניסה'}
                                                    </button>
                                                    <button onClick={() => del(a)}
                                                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50">מחק</button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showCreate && (
                <CreateAccount
                    onClose={() => setShowCreate(false)}
                    onCreated={(id) => { setShowCreate(false); load(); navigate(`/btb/${id}`); }}
                />
            )}
            {loginFor && (
                <ClientLoginModal
                    account={loginFor}
                    onClose={() => setLoginFor(null)}
                    onSaved={() => { setLoginFor(null); load(); }}
                />
            )}
        </div>
    );
}
