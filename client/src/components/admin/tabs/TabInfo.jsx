import { useState } from 'react';
import api from '@/services/api';

const BILLING = {
    active:    { label: 'פעיל',   color: 'text-green-700', bg: 'bg-green-50  border-green-200', dot: 'bg-green-500' },
    overdue:   { label: 'חייב',   color: 'text-red-700',   bg: 'bg-red-50    border-red-200',   dot: 'bg-red-500' },
    trial:     { label: 'ניסיון', color: 'text-blue-700',  bg: 'bg-blue-50   border-blue-200',  dot: 'bg-blue-500' },
    suspended: { label: 'מושהה',  color: 'text-gray-600',  bg: 'bg-gray-50   border-gray-200',  dot: 'bg-gray-400' },
    cancelled: { label: 'בוטל',   color: 'text-gray-500',  bg: 'bg-gray-50   border-gray-200',  dot: 'bg-gray-300' },
};
const PLAN_LABELS = { trial: 'ניסיון חינם', monthly: 'חודשי', annual: 'שנתי', custom: 'מותאם' };

function Row({ label, value, mono, warn }) {
    return (
        <div className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
            <span className={`text-sm ${warn ? 'text-orange-500' : mono ? 'font-mono text-gray-700' : 'text-gray-700'}`}>{value || '—'}</span>
            <span className="text-xs text-[#8696a0]">{label}</span>
        </div>
    );
}

export default function TabInfo({ tenant: t, onSaved }) {
    const bs = BILLING[t.billingStatus] || BILLING.trial;

    const daysUntil = t.nextBillingDate
        ? Math.ceil((new Date(t.nextBillingDate) - Date.now()) / 86_400_000)
        : null;

    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        planType:        t.planType        || 'trial',
        planPrice:       t.planPrice       || 0,
        billingStatus:   t.billingStatus   || 'trial',
        nextBillingDate: t.nextBillingDate ? new Date(t.nextBillingDate).toISOString().slice(0, 10) : '',
        contractEmail:   t.contractEmail   || '',
        internalNotes:   t.internalNotes   || '',
    });
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.put(`/tenants/${t._id}/plan`, form);
            onSaved();
            setEditing(false);
        } finally { setSaving(false); }
    };

    return (
        <div className="p-5 space-y-4">

            {/* Billing status card */}
            <div className={`rounded-xl border p-4 flex items-center gap-3 ${bs.bg}`}>
                <span className={`w-3 h-3 rounded-full flex-shrink-0 ${bs.dot}`} />
                <div className="flex-1 text-right">
                    <p className={`font-semibold text-sm ${bs.color}`}>{bs.label}</p>
                    <p className="text-xs text-gray-500">
                        {PLAN_LABELS[t.planType] || 'ניסיון'}
                        {t.planPrice > 0 ? ` — ₪${t.planPrice}/חודש` : ''}
                    </p>
                </div>
                {daysUntil !== null && (
                    <div className="text-center px-3 border-r border-gray-200">
                        <p className={`font-bold text-xl leading-none ${daysUntil < 0 ? 'text-red-600' : daysUntil <= 7 ? 'text-orange-500' : 'text-gray-700'}`}>
                            {Math.abs(daysUntil)}
                        </p>
                        <p className="text-xs text-gray-400">{daysUntil < 0 ? 'ימים פג' : 'ימים'}</p>
                    </div>
                )}
            </div>

            {/* Edit plan form */}
            {editing ? (
                <form onSubmit={save} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
                    <p className="text-sm font-semibold text-[#111b21] text-right mb-3">עדכון תוכנית</p>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-[#8696a0] mb-1 block">תוכנית</label>
                            <select value={form.planType} onChange={e => set('planType', e.target.value)} className="input-base">
                                <option value="trial">ניסיון</option>
                                <option value="monthly">חודשי</option>
                                <option value="annual">שנתי</option>
                                <option value="custom">מותאם</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-[#8696a0] mb-1 block">סטטוס חיוב</label>
                            <select value={form.billingStatus} onChange={e => set('billingStatus', e.target.value)} className="input-base">
                                <option value="trial">ניסיון</option>
                                <option value="active">פעיל</option>
                                <option value="overdue">חייב</option>
                                <option value="suspended">מושהה</option>
                                <option value="cancelled">בוטל</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-[#8696a0] mb-1 block">מחיר (₪/חודש)</label>
                            <input type="number" min="0" value={form.planPrice} onChange={e => set('planPrice', e.target.value)} className="input-base" />
                        </div>
                        <div>
                            <label className="text-xs text-[#8696a0] mb-1 block">חיוב הבא</label>
                            <input type="date" value={form.nextBillingDate} onChange={e => set('nextBillingDate', e.target.value)} className="input-base" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-[#8696a0] mb-1 block">מייל ליצירת קשר</label>
                        <input type="email" value={form.contractEmail} onChange={e => set('contractEmail', e.target.value)} className="input-base" placeholder="client@company.com" />
                    </div>
                    <div>
                        <label className="text-xs text-[#8696a0] mb-1 block">הערה פנימית קצרה</label>
                        <input type="text" value={form.internalNotes} onChange={e => set('internalNotes', e.target.value)} className="input-base" placeholder="הערה לתצוגה בסרגל הצד" />
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button type="submit" disabled={saving} className="flex-1 bg-[#25D366] text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                            {saving ? 'שומר...' : 'שמור'}
                        </button>
                        <button type="button" onClick={() => setEditing(false)} className="px-4 bg-gray-100 text-gray-600 py-2 rounded-lg text-sm">ביטול</button>
                    </div>
                </form>
            ) : (
                <>
                    <div className="bg-white rounded-xl shadow-sm p-5">
                        <div className="flex justify-between items-center mb-3">
                            <button onClick={() => setEditing(true)} className="text-xs text-[#25D366] font-medium">ערוך</button>
                            <p className="text-sm font-semibold text-[#111b21]">פרטי תוכנית</p>
                        </div>
                        <Row label="מספר וואצאפ"   value={t.phone} mono />
                        <Row label="מייל ליצירת קשר" value={t.contractEmail} />
                        <Row label="נרשם בתאריך"   value={t.createdAt ? new Date(t.createdAt).toLocaleDateString('he-IL') : '—'} />
                        {t.nextBillingDate && <Row label="חיוב הבא" value={new Date(t.nextBillingDate).toLocaleDateString('he-IL')} />}
                        {t.internalNotes && <Row label="הערה" value={t.internalNotes} />}
                    </div>
                </>
            )}
        </div>
    );
}
