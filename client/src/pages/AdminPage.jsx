import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const STATUS = {
    connected:    { text: 'מחובר',        dot: 'bg-[#25D366]' },
    connecting:   { text: 'מתחבר...',      dot: 'bg-yellow-400' },
    waiting_qr:   { text: 'ממתין לסריקה', dot: 'bg-blue-500'  },
    disconnected: { text: 'מנותק',         dot: 'bg-red-500'   },
};

export default function AdminPage() {
    const [tenants, setTenants]         = useState([]);
    const [selectedId, setSelectedId]   = useState(null);
    const [search, setSearch]           = useState('');
    const [showAdd, setShowAdd]         = useState(false);
    const [newName, setNewName]         = useState('');
    const [newPhone, setNewPhone]       = useState('');
    const [addError, setAddError]       = useState('');
    const [addLoading, setAddLoading]   = useState(false);
    const [editModal, setEditModal]     = useState(null); // { id, name, phone }
    const [editForm, setEditForm]       = useState({ name: '', phone: '' });
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError]     = useState('');
    const [qrModal, setQrModal]         = useState(null);
    const [composeModal, setCompose]    = useState(null);
    const [composeForm, setComposeForm] = useState({ phone: '', message: '' });
    const [sendLoading, setSendLoading] = useState(false);
    const [sendError, setSendError]     = useState('');

    const fetchTenants = useCallback(async () => {
        try { setTenants((await api.get('/tenants')).data); }
        catch (e) { console.error(e); }
    }, []);

    useEffect(() => {
        fetchTenants();
        const i = setInterval(fetchTenants, 5000);
        return () => clearInterval(i);
    }, [fetchTenants]);

    const handleAdd = async (e) => {
        e.preventDefault();
        setAddLoading(true); setAddError('');
        try {
            await api.post('/tenants', { name: newName, phone: newPhone });
            setNewName(''); setNewPhone(''); setShowAdd(false);
            fetchTenants();
        } catch (err) { setAddError(err.response?.data?.error || 'שגיאה'); }
        finally { setAddLoading(false); }
    };

    const handleSend = async (e) => {
        e.preventDefault();
        setSendLoading(true); setSendError('');
        try {
            await api.post(`/tenants/${composeModal.tenantId}/send`, composeForm);
            setComposeForm({ phone: '', message: '' }); setCompose(null);
        } catch (err) { setSendError(err.response?.data?.error || 'שגיאה'); }
        finally { setSendLoading(false); }
    };

    const openEdit = (t) => {
        setEditForm({ name: t.name, phone: t.phone });
        setEditError('');
        setEditModal({ id: t._id });
    };

    const handleEdit = async (e) => {
        e.preventDefault();
        setEditLoading(true); setEditError('');
        try {
            await api.put(`/tenants/${editModal.id}/info`, editForm);
            setEditModal(null);
            fetchTenants();
        } catch (err) { setEditError(err.response?.data?.error || 'שגיאה'); }
        finally { setEditLoading(false); }
    };

    const handleDelete = async (id, name) => {
        if (!confirm(`למחוק את "${name}"?`)) return;
        await api.delete(`/tenants/${id}`);
        if (selectedId === id) setSelectedId(null);
        fetchTenants();
    };

    const openQR = async (t) => {
        try {
            const res = await api.get(`/tenants/${t._id}/qr`);
            setQrModal({ id: t._id, qr: res.data.qr, name: t.name });
        } catch { alert('QR לא זמין כרגע'); }
    };

    const filtered = tenants.filter(t =>
        t.name.includes(search) || t.phone.includes(search)
    );
    const selected = tenants.find(t => t._id === selectedId);
    const connected = tenants.filter(t => t.waStatus === 'connected').length;

    return (
        <div className="flex h-full" style={{ direction: 'ltr' }}>

            {/* ── Sidebar ── */}
            <aside className="w-[360px] flex-shrink-0 flex flex-col bg-white border-r border-[#d1d7db]" style={{ direction: 'rtl' }}>

                {/* Sidebar header */}
                <div className="bg-[#f0f2f5] px-4 py-3 flex items-center justify-between flex-shrink-0">
                    <button
                        onClick={() => setShowAdd(true)}
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

                {/* Search */}
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

                {/* Tenant list */}
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
                                onClick={() => setSelectedId(t._id)}
                            />
                        ))
                    )}
                </div>
            </aside>

            {/* ── Main panel ── */}
            <div className="flex-1 flex flex-col overflow-hidden" style={{ direction: 'rtl', backgroundColor: '#eae6df' }}>
                {selected ? (
                    <TenantPanel
                        key={selected._id}
                        tenant={selected}
                        onQR={() => openQR(selected)}
                        onReconnect={() => api.post(`/tenants/${selected._id}/reconnect`).then(fetchTenants)}
                        onDelete={() => handleDelete(selected._id, selected.name)}
                        onEdit={() => openEdit(selected)}
                        onCompose={() => {
                            setCompose({ tenantId: selected._id, name: selected.name });
                            setComposeForm({ phone: '', message: '' });
                            setSendError('');
                        }}
                        onEmailSaved={fetchTenants}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none">
                        <div className="w-24 h-24 rounded-full bg-[#d1d7db] flex items-center justify-center mb-5 text-5xl">💬</div>
                        <h3 className="text-2xl font-light text-[#41525d] mb-2">Bridge Manager</h3>
                        <p className="text-sm text-[#8696a0] max-w-xs leading-relaxed">
                            בחר לקוח מהרשימה משמאל כדי לצפות ולנהל את הגדרותיו
                        </p>
                        {tenants.length === 0 && (
                            <button
                                onClick={() => setShowAdd(true)}
                                className="mt-6 bg-[#25D366] text-white px-8 py-2.5 rounded-full font-medium hover:bg-[#1fb954] transition text-sm shadow">
                                + הוסף לקוח ראשון
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* ── Add tenant modal ── */}
            {showAdd && (
                <Modal onClose={() => setShowAdd(false)}>
                    <h3 className="text-lg font-bold mb-1 text-[#111b21]">לקוח חדש</h3>
                    <p className="text-sm text-[#8696a0] mb-5">הזן שם ומספר וואצאפ</p>
                    <form onSubmit={handleAdd} className="space-y-3">
                        <Field label="שם הלקוח">
                            <input className="input-base" placeholder="משה לוי"
                                value={newName} onChange={e => setNewName(e.target.value)} required />
                        </Field>
                        <Field label="מספר וואצאפ">
                            <input className="input-base" placeholder="972501234567"
                                value={newPhone} onChange={e => setNewPhone(e.target.value)} required />
                        </Field>
                        {addError && <p className="text-red-500 text-sm">{addError}</p>}
                        <div className="flex gap-2 pt-1">
                            <button type="submit" disabled={addLoading}
                                className="flex-1 bg-[#25D366] text-white py-2.5 rounded-xl font-medium hover:bg-[#1fb954] disabled:opacity-50 transition text-sm">
                                {addLoading ? '...' : 'הוסף'}
                            </button>
                            <button type="button" onClick={() => setShowAdd(false)}
                                className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl font-medium hover:bg-gray-200 transition text-sm">
                                ביטול
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* ── Edit tenant modal ── */}
            {editModal && (
                <Modal onClose={() => setEditModal(null)}>
                    <h3 className="text-lg font-bold mb-1 text-[#111b21]">עריכת לקוח</h3>
                    <p className="text-sm text-[#8696a0] mb-5">ערוך שם ומספר וואצאפ</p>
                    <form onSubmit={handleEdit} className="space-y-3">
                        <Field label="שם הלקוח">
                            <input className="input-base" placeholder="משה לוי"
                                value={editForm.name}
                                onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} required />
                        </Field>
                        <Field label="מספר וואצאפ">
                            <input className="input-base" placeholder="972501234567"
                                value={editForm.phone}
                                onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} required />
                        </Field>
                        {editError && <p className="text-red-500 text-sm">{editError}</p>}
                        <div className="flex gap-2 pt-1">
                            <button type="submit" disabled={editLoading}
                                className="flex-1 bg-[#25D366] text-white py-2.5 rounded-xl font-medium hover:bg-[#1fb954] disabled:opacity-50 transition text-sm">
                                {editLoading ? '...' : 'שמור'}
                            </button>
                            <button type="button" onClick={() => setEditModal(null)}
                                className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl font-medium hover:bg-gray-200 transition text-sm">
                                ביטול
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* ── QR modal ── */}
            {qrModal && (
                <Modal onClose={() => setQrModal(null)}>
                    <div className="text-center">
                        <p className="text-lg font-bold mb-1 text-[#111b21]">{qrModal.name}</p>
                        <p className="text-sm text-[#8696a0] mb-5">סרוק עם וואצאפ</p>
                        <img src={qrModal.qr} alt="QR" className="mx-auto w-60 h-60 rounded-xl" />
                        <p className="text-xs text-[#8696a0] mt-4">וואצאפ ← מכשירים מקושרים ← קשר מכשיר</p>
                    </div>
                </Modal>
            )}

            {/* ── Compose modal ── */}
            {composeModal && (
                <Modal onClose={() => setCompose(null)}>
                    <h3 className="text-lg font-bold mb-1 text-[#111b21]">שלח הודעה</h3>
                    <p className="text-sm text-[#8696a0] mb-5">{composeModal.name}</p>
                    <form onSubmit={handleSend} className="space-y-3">
                        <Field label="מספר נייד">
                            <input className="input-base" placeholder="972501234567"
                                value={composeForm.phone} onChange={e => setComposeForm(p => ({ ...p, phone: e.target.value }))} required />
                        </Field>
                        <Field label="הודעה">
                            <textarea className="input-base h-28 resize-none"
                                value={composeForm.message} onChange={e => setComposeForm(p => ({ ...p, message: e.target.value }))} required />
                        </Field>
                        {sendError && <p className="text-red-500 text-sm">{sendError}</p>}
                        <div className="flex gap-2 pt-1">
                            <button type="submit" disabled={sendLoading}
                                className="flex-1 bg-[#25D366] text-white py-2.5 rounded-xl font-medium hover:bg-[#1fb954] disabled:opacity-50 transition text-sm">
                                {sendLoading ? 'שולח...' : 'שלח'}
                            </button>
                            <button type="button" onClick={() => setCompose(null)}
                                className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl font-medium hover:bg-gray-200 transition text-sm">
                                ביטול
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}

// ─── Sidebar row ─────────────────────────────────────────────────
function TenantListRow({ tenant: t, selected, onClick }) {
    const s = STATUS[t.waStatus] || STATUS.disconnected;
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

const BRIDGE_STATUS = {
    active:       { text: 'מחובר',   dot: 'bg-[#25D366]', color: 'text-green-600' },
    inactive:     { text: 'לא מוגדר', dot: 'bg-gray-300',  color: 'text-gray-400'  },
    disconnected: { text: 'מנותק',   dot: 'bg-red-500',   color: 'text-red-500'   },
};

// ─── Right panel ─────────────────────────────────────────────────
function TenantPanel({ tenant: t, onQR, onReconnect, onDelete, onEdit, onCompose, onEmailSaved }) {
    const s = STATUS[t.waStatus] || STATUS.disconnected;
    const [ef, setEf] = useState({
        bridgeEmail: t.bridgeEmail || '',
        bridgeEmailPassword: '',
        destinationEmail: t.destinationEmail || '',
    });
    const [saving, setSaving] = useState(false);
    const [saveResult, setSaveResult] = useState(null); // { ok, msg }

    const bridge = t.bridge || {};
    const bridgeStatusKey = bridge.active ? 'active' : (t.bridgeEmail ? 'disconnected' : 'inactive');
    const bs = BRIDGE_STATUS[bridgeStatusKey];

    const saveEmail = async (e) => {
        e.preventDefault(); setSaving(true); setSaveResult(null);
        try {
            const res = await api.put(`/tenants/${t._id}/email-config`, ef);
            if (res.data.imapOk) {
                setSaveResult({ ok: true, msg: '✓ נשמר והמייל מחובר ופועל' });
            } else {
                setSaveResult({ ok: false, msg: `✓ נשמר — אבל חיבור IMAP נכשל: ${res.data.imapError}` });
            }
            onEmailSaved();
        } catch (err) {
            setSaveResult({ ok: false, msg: err.response?.data?.error || 'שגיאה' });
        } finally { setSaving(false); }
    };

    return (
        <div className="flex flex-col h-full">

            {/* Panel header */}
            <div className="bg-[#f0f2f5] px-4 py-2.5 flex items-center justify-between flex-shrink-0 border-b border-[#d1d7db]">
                <div className="flex items-center gap-2">
                    <WaBtn onClick={onDelete} red>מחק</WaBtn>
                    <WaBtn onClick={onEdit}>ערוך</WaBtn>
                    {t.waStatus === 'connected'    && <WaBtn onClick={onCompose} green>שלח הודעה</WaBtn>}
                    {t.waStatus === 'waiting_qr'   && <WaBtn onClick={onQR}>הצג QR</WaBtn>}
                    {t.waStatus === 'disconnected' && <WaBtn onClick={onReconnect} yellow>חבר מחדש</WaBtn>}
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className="font-semibold text-[#111b21] text-sm">{t.name}</p>
                        <div className="flex items-center gap-1.5 justify-end">
                            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                            <span className="text-xs text-[#8696a0]">{s.text}</span>
                        </div>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-[#dfe5e7] flex items-center justify-center text-[#075E54] font-bold text-base flex-shrink-0">
                        {t.name.charAt(0).toUpperCase()}
                    </div>
                </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

                {/* Email config card */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="bg-[#075E54] px-5 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${bs.dot}`} />
                            <span className={`text-xs font-medium ${bridgeStatusKey === 'active' ? 'text-[#dcf8c6]' : 'text-[#aecdc8]'}`}>
                                {bs.text}
                            </span>
                        </div>
                        <p className="text-white font-semibold text-sm">הגדרות מייל</p>
                    </div>
                    <form onSubmit={saveEmail} className="p-5 space-y-4">
                        <Field label="מייל תעבורה" hint="ה-Gmail שיצרת ללקוח — המערכת שולחת ממנו ומאזינה לתשובות">
                            <input className="input-base" type="email" placeholder="bridge@gmail.com"
                                value={ef.bridgeEmail} onChange={e => setEf(p => ({ ...p, bridgeEmail: e.target.value }))} required />
                        </Field>
                        <Field label="App Password" hint="השאר ריק כדי לשמור את הסיסמא הקיימת • Google Account ← Security ← App Passwords">
                            <input className="input-base font-mono" type="text"
                                autoComplete="off" autoCorrect="off" spellCheck="false"
                                placeholder="xxxx xxxx xxxx xxxx (ריק = ללא שינוי)"
                                value={ef.bridgeEmailPassword} onChange={e => setEf(p => ({ ...p, bridgeEmailPassword: e.target.value }))} />
                        </Field>
                        <Field label="מייל ייעד" hint="המייל האישי של הלקוח — לכאן מגיעות ההודעות ומכאן הוא עונה">
                            <input className="input-base" type="email" placeholder="client@gmail.com"
                                value={ef.destinationEmail} onChange={e => setEf(p => ({ ...p, destinationEmail: e.target.value }))} required />
                        </Field>
                        <div className="flex flex-col gap-2">
                            <button type="submit" disabled={saving}
                                className="bg-[#25D366] text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-[#1fb954] disabled:opacity-50 transition flex items-center justify-center gap-2">
                                {saving ? (
                                    <>
                                        <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                        בודק חיבור...
                                    </>
                                ) : 'שמור ובדוק חיבור'}
                            </button>
                            {saveResult && (
                                <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm
                                    ${saveResult.ok
                                        ? 'bg-green-50 text-green-700 border border-green-200'
                                        : 'bg-red-50 text-red-600 border border-red-200'}`}>
                                    <span className="flex-shrink-0 mt-0.5">{saveResult.ok ? '✓' : '✕'}</span>
                                    <span>{saveResult.msg}</span>
                                </div>
                            )}
                        </div>
                    </form>
                </div>

                {/* Connection details card */}
                <div className="bg-white rounded-xl shadow-sm p-5">
                    <p className="text-sm font-semibold text-[#111b21] mb-3">פרטי חיבור</p>
                    <div className="divide-y divide-gray-50">
                        {/* WhatsApp status */}
                        <div className="flex justify-between items-center py-2.5">
                            <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                                <span className={`text-sm font-medium ${
                                    t.waStatus === 'connected'  ? 'text-green-600' :
                                    t.waStatus === 'connecting' ? 'text-yellow-600' :
                                    t.waStatus === 'waiting_qr' ? 'text-blue-600' : 'text-red-500'
                                }`}>{s.text}</span>
                            </div>
                            <span className="text-xs text-[#8696a0]">וואצאפ</span>
                        </div>
                        {/* Email bridge status */}
                        <div className="flex justify-between items-center py-2.5">
                            <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${bs.dot}`} />
                                <span className={`text-sm font-medium ${bs.color}`}>{bs.text}</span>
                            </div>
                            <span className="text-xs text-[#8696a0]">גשר מייל</span>
                        </div>
                        <InfoRow label="מספר וואצאפ" value={t.phone} mono />
                        <InfoRow label="מייל תעבורה" value={t.bridgeEmail || '—'} warn={!t.bridgeEmail} />
                        <InfoRow label="מייל ייעד"    value={t.destinationEmail || '—'} warn={!t.destinationEmail} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Micro components ─────────────────────────────────────────────
function InfoRow({ label, value, mono, warn }) {
    return (
        <div className="flex justify-between items-center py-2.5">
            <span className={`text-sm ${warn ? 'text-orange-400 font-medium' : mono ? 'font-mono text-gray-600' : 'text-gray-600'}`}>
                {value}
            </span>
            <span className="text-xs text-[#8696a0]">{label}</span>
        </div>
    );
}

function Field({ label, hint, children }) {
    return (
        <div>
            <label className="block text-sm font-medium text-[#111b21] mb-1">{label}</label>
            {hint && <p className="text-xs text-[#8696a0] mb-1.5">{hint}</p>}
            {children}
        </div>
    );
}

function WaBtn({ onClick, children, green, red, yellow }) {
    const c = green  ? 'bg-[#dcf8c6] text-[#075E54] hover:bg-[#c8f0a8]'
            : red    ? 'bg-red-50 text-red-600 hover:bg-red-100'
            : yellow ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
            :          'bg-blue-50 text-blue-700 hover:bg-blue-100';
    return (
        <button onClick={onClick} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${c}`}>
            {children}
        </button>
    );
}

function Modal({ onClose, children }) {
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                {children}
            </div>
        </div>
    );
}
