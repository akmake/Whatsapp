import { useState } from 'react';
import api from '@/services/api';
import { BRIDGE_STATUS } from '@/components/admin/constants';
import Field from '@/components/ui/Field';

export default function TabEmail({ tenant: t, onSaved }) {
    const bridge = t.bridge || {};
    const bsKey  = bridge.active ? 'active' : (t.bridgeEmail ? 'disconnected' : 'inactive');
    const bs     = BRIDGE_STATUS[bsKey];

    const [ef, setEf]             = useState({ bridgeEmail: t.bridgeEmail || '', bridgeEmailPassword: '', destinationEmail: t.destinationEmail || '' });
    const [saving, setSaving]     = useState(false);
    const [saveResult, setSaveResult] = useState(null);

    const saveEmail = async (e) => {
        e.preventDefault(); setSaving(true); setSaveResult(null);
        try {
            const res = await api.put(`/tenants/${t._id}/email-config`, ef);
            setSaveResult(res.data.imapOk
                ? { ok: true,  msg: '✓ נשמר והמייל מחובר ופועל' }
                : { ok: false, msg: `✓ נשמר — אבל IMAP נכשל: ${res.data.imapError}` }
            );
            onSaved();
        } catch (err) {
            setSaveResult({ ok: false, msg: err.response?.data?.error || 'שגיאה' });
        } finally { setSaving(false); }
    };

    return (
        <div className="p-5">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="bg-[#075E54] px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${bs.dot}`} />
                        <span className={`text-xs font-medium ${bsKey === 'active' ? 'text-[#dcf8c6]' : 'text-[#aecdc8]'}`}>{bs.text}</span>
                    </div>
                    <p className="text-white font-semibold text-sm">הגדרות מייל</p>
                </div>
                <form onSubmit={saveEmail} className="p-5 space-y-4">
                    <Field label="מייל תעבורה" hint="ה-Gmail שיצרת ללקוח — המערכת שולחת ממנו ומאזינה לתשובות">
                        <input className="input-base" type="email" placeholder="bridge@gmail.com" required
                            value={ef.bridgeEmail} onChange={e => setEf(p => ({ ...p, bridgeEmail: e.target.value }))} />
                    </Field>
                    <Field label="App Password" hint="השאר ריק כדי לשמור את הסיסמה הקיימת • Google Account ← Security ← App Passwords">
                        <input className="input-base font-mono" type="text" autoComplete="off"
                            placeholder="xxxx xxxx xxxx xxxx (ריק = ללא שינוי)"
                            value={ef.bridgeEmailPassword} onChange={e => setEf(p => ({ ...p, bridgeEmailPassword: e.target.value }))} />
                    </Field>
                    <Field label="מייל ייעד" hint="המייל האישי של הלקוח — לכאן מגיעות ההודעות ומכאן הוא עונה">
                        <input className="input-base" type="email" placeholder="client@gmail.com" required
                            value={ef.destinationEmail} onChange={e => setEf(p => ({ ...p, destinationEmail: e.target.value }))} />
                    </Field>
                    <button type="submit" disabled={saving}
                        className="w-full bg-[#25D366] text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-[#1fb954] disabled:opacity-50 transition flex items-center justify-center gap-2">
                        {saving ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />בודק חיבור...</> : 'שמור ובדוק חיבור'}
                    </button>
                    {saveResult && (
                        <div className={`px-3 py-2.5 rounded-lg text-sm flex gap-2 ${saveResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                            <span>{saveResult.ok ? '✓' : '✕'}</span>
                            <span>{saveResult.msg}</span>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
