import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const STATUS_LABEL = {
    connected:    { text: 'מחובר',          color: 'bg-green-100 text-green-700' },
    connecting:   { text: 'מתחבר...',        color: 'bg-yellow-100 text-yellow-700' },
    waiting_qr:   { text: 'ממתין לסריקה',    color: 'bg-blue-100 text-blue-700' },
    disconnected: { text: 'מנותק',           color: 'bg-red-100 text-red-700' },
};

const emptyForm = { name: '', phone: '', email: '', emailPassword: '', emailHost: 'imap.gmail.com' };

export default function AdminPage() {
    const [tenants, setTenants] = useState([]);
    const [form, setForm] = useState(emptyForm);
    const [showForm, setShowForm] = useState(false);
    const [qrModal, setQrModal] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchTenants = useCallback(async () => {
        try {
            const res = await api.get('/tenants');
            setTenants(res.data);
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        fetchTenants();
        const interval = setInterval(fetchTenants, 5000);
        return () => clearInterval(interval);
    }, [fetchTenants]);

    useEffect(() => {
        const waiting = tenants.find(t => t.waStatus === 'waiting_qr');
        if (!waiting || qrModal?.id === waiting._id) return;
        api.get(`/tenants/${waiting._id}/qr`)
            .then(res => setQrModal({ id: waiting._id, qr: res.data.qr, name: waiting.name }))
            .catch(() => {});
    }, [tenants, qrModal]);

    const handleAdd = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await api.post('/tenants', form);
            setForm(emptyForm);
            setShowForm(false);
            fetchTenants();
        } catch (err) {
            setError(err.response?.data?.error || 'שגיאה בהוספה');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id, name) => {
        if (!confirm(`למחוק את "${name}"?`)) return;
        await api.delete(`/tenants/${id}`);
        fetchTenants();
    };

    const handleReconnect = async (id) => {
        await api.post(`/tenants/${id}/reconnect`);
        fetchTenants();
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
            <div className="max-w-4xl mx-auto">

                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">ניהול לקוחות</h1>
                    <button onClick={() => setShowForm(v => !v)}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition">
                        {showForm ? 'ביטול' : '+ לקוח חדש'}
                    </button>
                </div>

                {showForm && (
                    <form onSubmit={handleAdd} className="bg-white rounded-xl shadow p-5 mb-6 grid grid-cols-2 gap-4">
                        <h2 className="col-span-2 text-lg font-semibold text-gray-700">הוספת לקוח חדש</h2>

                        <input className="border rounded-lg p-2 col-span-2" placeholder="שם הלקוח"
                            value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />

                        <input className="border rounded-lg p-2" placeholder="מספר טלפון (972...)"
                            value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} required />

                        <input className="border rounded-lg p-2" placeholder="כתובת מייל" type="email"
                            value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />

                        <input className="border rounded-lg p-2" placeholder="סיסמת מייל (App Password)" type="password"
                            value={form.emailPassword} onChange={e => setForm(p => ({ ...p, emailPassword: e.target.value }))} required />

                        <select className="border rounded-lg p-2" value={form.emailHost}
                            onChange={e => setForm(p => ({ ...p, emailHost: e.target.value }))}>
                            <option value="imap.gmail.com">Gmail</option>
                            <option value="imap.mail.yahoo.com">Yahoo</option>
                            <option value="outlook.office365.com">Outlook</option>
                        </select>

                        {error && <p className="col-span-2 text-red-600 text-sm">{error}</p>}

                        <button type="submit" disabled={loading}
                            className="col-span-2 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition">
                            {loading ? 'מוסיף...' : 'הוסף לקוח'}
                        </button>
                    </form>
                )}

                {tenants.length === 0 ? (
                    <div className="bg-white rounded-xl shadow p-10 text-center text-gray-400">
                        אין לקוחות עדיין. לחץ על "+ לקוח חדש" להתחיל.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {tenants.map(t => {
                            const status = STATUS_LABEL[t.waStatus] || STATUS_LABEL.disconnected;
                            return (
                                <div key={t._id} className="bg-white rounded-xl shadow p-4 flex items-center gap-4">
                                    <div className="flex-1">
                                        <p className="font-semibold text-gray-800">{t.name}</p>
                                        <p className="text-sm text-gray-500">{t.phone} · {t.email}</p>
                                    </div>
                                    <span className={`text-xs font-medium px-3 py-1 rounded-full ${status.color}`}>
                                        {status.text}
                                    </span>
                                    <div className="flex gap-2">
                                        {t.waStatus === 'waiting_qr' && (
                                            <button onClick={() =>
                                                api.get(`/tenants/${t._id}/qr`).then(r =>
                                                    setQrModal({ id: t._id, qr: r.data.qr, name: t.name }))}
                                                className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-lg hover:bg-blue-200 transition">
                                                הצג QR
                                            </button>
                                        )}
                                        {t.waStatus === 'disconnected' && (
                                            <button onClick={() => handleReconnect(t._id)}
                                                className="text-sm bg-yellow-100 text-yellow-700 px-3 py-1 rounded-lg hover:bg-yellow-200 transition">
                                                חבר מחדש
                                            </button>
                                        )}
                                        <button onClick={() => handleDelete(t._id, t.name)}
                                            className="text-sm bg-red-100 text-red-700 px-3 py-1 rounded-lg hover:bg-red-200 transition">
                                            מחק
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {qrModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
                    onClick={() => setQrModal(null)}>
                    <div className="bg-white rounded-2xl p-6 text-center shadow-xl max-w-sm w-full"
                        onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold mb-1">סרוק עם הטלפון</h3>
                        <p className="text-sm text-gray-500 mb-4">{qrModal.name}</p>
                        <img src={qrModal.qr} alt="QR Code" className="mx-auto w-64 h-64" />
                        <p className="text-xs text-gray-400 mt-3">פתח וואצאפ ← מכשירים מקושרים ← קשר מכשיר</p>
                        <button onClick={() => setQrModal(null)}
                            className="mt-4 text-sm text-gray-500 hover:text-gray-700">סגור</button>
                    </div>
                </div>
            )}
        </div>
    );
}