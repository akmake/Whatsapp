import { useState } from 'react';
import api from '@/services/api';
import { WA_STATUS, BRIDGE_STATUS } from './constants';
import Field from '@/components/ui/Field';
import WaBtn from '@/components/ui/WaBtn';

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

export default function TenantPanel({ tenant: t, onQR, onReconnect, onDelete, onEdit, onCompose, onEmailSaved }) {
    const s = WA_STATUS[t.waStatus] || WA_STATUS.disconnected;
    const [ef, setEf] = useState({
        bridgeEmail: t.bridgeEmail || '',
        bridgeEmailPassword: '',
        destinationEmail: t.destinationEmail || '',
    });
    const [saving, setSaving] = useState(false);
    const [saveResult, setSaveResult] = useState(null);

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

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
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

                <div className="bg-white rounded-xl shadow-sm p-5">
                    <p className="text-sm font-semibold text-[#111b21] mb-3">פרטי חיבור</p>
                    <div className="divide-y divide-gray-50">
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
