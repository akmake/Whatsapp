import { useState, useEffect } from 'react';
import api from '@/services/api';

const METHOD = { credit: 'כרטיס אשראי', bank: 'העברה בנקאית', cash: 'מזומן', bit: 'ביט', paybox: 'PayBox', other: 'אחר' };

const EMPTY = { amount: '', method: 'bit', period: '', paidAt: new Date().toISOString().slice(0, 10), notes: '' };

export default function TabPayments({ tenantId }) {
    const [payments, setPayments] = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form,     setForm]     = useState(EMPTY);
    const [saving,   setSaving]   = useState(false);
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const load = async () => {
        setLoading(true);
        try { setPayments((await api.get(`/tenants/${tenantId}/payments`)).data); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [tenantId]);

    const add = async (e) => {
        e.preventDefault(); setSaving(true);
        try {
            await api.post(`/tenants/${tenantId}/payments`, form);
            setShowForm(false); setForm(EMPTY); load();
        } finally { setSaving(false); }
    };

    const del = async (id) => {
        if (!confirm('למחוק תשלום זה?')) return;
        await api.delete(`/tenants/${tenantId}/payments/${id}`);
        load();
    };

    const total = payments.reduce((s, p) => s + p.amount, 0);
    const last  = payments[0];

    return (
        <div className="p-5 space-y-4">

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                    <p className="text-2xl font-bold text-[#111b21]">₪{total.toLocaleString()}</p>
                    <p className="text-xs text-[#8696a0] mt-0.5">סה"כ שולם</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                    <p className="text-2xl font-bold text-[#111b21]">{payments.length}</p>
                    <p className="text-xs text-[#8696a0] mt-0.5">
                        {last ? `אחרון: ${new Date(last.paidAt).toLocaleDateString('he-IL')}` : 'תשלומים'}
                    </p>
                </div>
            </div>

            <button onClick={() => setShowForm(s => !s)}
                className="w-full bg-[#25D366] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#1fb954] transition">
                {showForm ? 'ביטול' : '+ הוסף תשלום'}
            </button>

            {/* Add form */}
            {showForm && (
                <form onSubmit={add} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-[#8696a0] mb-1 block">סכום (₪)</label>
                            <input type="number" required min="1" value={form.amount} onChange={e => set('amount', e.target.value)} className="input-base" placeholder="100" />
                        </div>
                        <div>
                            <label className="text-xs text-[#8696a0] mb-1 block">אמצעי תשלום</label>
                            <select value={form.method} onChange={e => set('method', e.target.value)} className="input-base">
                                {Object.entries(METHOD).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-[#8696a0] mb-1 block">תקופה</label>
                            <input type="text" value={form.period} onChange={e => set('period', e.target.value)} className="input-base" placeholder="01/2025" />
                        </div>
                        <div>
                            <label className="text-xs text-[#8696a0] mb-1 block">תאריך תשלום</label>
                            <input type="date" value={form.paidAt} onChange={e => set('paidAt', e.target.value)} className="input-base" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-[#8696a0] mb-1 block">הערה</label>
                        <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)} className="input-base" placeholder="אופציונלי" />
                    </div>
                    <button type="submit" disabled={saving}
                        className="w-full bg-[#075E54] text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
                        {saving ? 'שומר...' : 'שמור תשלום'}
                    </button>
                </form>
            )}

            {/* List */}
            {loading ? (
                <div className="text-center py-8 text-[#8696a0] text-sm">טוען...</div>
            ) : payments.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-xl shadow-sm">
                    <p className="text-3xl mb-2">💳</p>
                    <p className="text-sm text-[#8696a0]">אין תשלומים עדיין</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {payments.map(p => (
                        <div key={p._id} className="bg-white rounded-xl shadow-sm px-4 py-3 flex items-center gap-3">
                            <button onClick={() => del(p._id)} className="text-gray-300 hover:text-red-500 transition flex-shrink-0 text-lg leading-none">×</button>
                            <div className="flex-1 text-right">
                                <div className="flex items-center justify-end gap-2">
                                    <span className="font-bold text-[#111b21]">₪{p.amount.toLocaleString()}</span>
                                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{METHOD[p.method] || p.method}</span>
                                    {p.period && <span className="text-xs text-[#8696a0]">{p.period}</span>}
                                </div>
                                {p.notes && <p className="text-xs text-gray-400 mt-0.5">{p.notes}</p>}
                            </div>
                            <div className="text-left flex-shrink-0">
                                <p className="text-xs text-[#111b21] font-medium">{new Date(p.paidAt).toLocaleDateString('he-IL')}</p>
                                <p className="text-xs text-[#8696a0]">{p.createdBy?.split('@')[0]}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
