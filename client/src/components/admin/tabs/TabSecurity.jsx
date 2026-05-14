import { useState, useEffect, useRef } from 'react';
import api from '@/services/api';

function CopyField({ label, value }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between">
                <button onClick={copy} className={`text-xs font-medium transition ${copied ? 'text-[#25D366]' : 'text-blue-500 hover:text-blue-700'}`}>
                    {copied ? '✓ הועתק' : 'העתק'}
                </button>
                <span className="text-xs text-[#8696a0]">{label}</span>
            </div>
            <p className="font-mono text-sm text-[#111b21] mt-1 text-right break-all select-all">{value}</p>
        </div>
    );
}

export default function TabSecurity({ tenantId, tenant }) {
    const [step,      setStep]      = useState('form');   // form | revealed
    const [reason,    setReason]    = useState('');
    const [creds,     setCreds]     = useState(null);
    const [countdown, setCountdown] = useState(30);
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState('');
    const [auditLogs, setAuditLogs] = useState([]);
    const timerRef = useRef(null);

    useEffect(() => {
        api.get(`/audit?tenantId=${tenantId}&action=credential.reveal&limit=10`)
            .then(r => setAuditLogs(r.data))
            .catch(() => {});
    }, [tenantId]);

    useEffect(() => () => clearInterval(timerRef.current), []);

    const reveal = async (e) => {
        e.preventDefault();
        if (!reason.trim()) return setError('יש להזין סיבה לגיטימית');
        setError(''); setLoading(true);
        try {
            const res = await api.post(`/tenants/${tenantId}/reveal-credentials`, { reason });
            setCreds(res.data);
            setStep('revealed');
            let n = 30; setCountdown(n);
            timerRef.current = setInterval(() => {
                n--; setCountdown(n);
                if (n <= 0) { clearInterval(timerRef.current); hide(); }
            }, 1000);
            setAuditLogs(prev => [{
                _id: Date.now(), userEmail: '—', createdAt: new Date(),
                meta: { reason: reason.trim() }
            }, ...prev.slice(0, 9)]);
        } catch (err) {
            setError(err.response?.data?.error || 'שגיאה בחשיפת הפרטים');
        } finally { setLoading(false); }
    };

    const hide = () => {
        clearInterval(timerRef.current);
        setCreds(null); setStep('form'); setReason(''); setCountdown(30);
    };

    return (
        <div className="p-5 space-y-4">

            {/* Warning */}
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-700 text-right font-medium mb-1">⚠️ אזור רגיש</p>
                <p className="text-xs text-red-600 text-right leading-relaxed">
                    כל חשיפת סיסמה מתועדת: זמן, כתובת IP, משתמש וסיבה. הגישה מוגבלת ל-15 חשיפות לשעה.
                </p>
            </div>

            {step === 'revealed' && creds ? (
                <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
                    <div className="flex items-center justify-between">
                        <button onClick={hide} className="text-xs text-gray-400 hover:text-gray-600">הסתר</button>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-red-500">נוסתר בעוד {countdown}ש׳</span>
                            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                        </div>
                    </div>
                    <CopyField label="מייל תעבורה"  value={creds.bridgeEmail} />
                    <CopyField label="App Password" value={creds.bridgeEmailPassword} />
                </div>
            ) : (
                <form onSubmit={reveal} className="bg-white rounded-xl shadow-sm p-5 space-y-4">
                    <p className="text-sm font-semibold text-[#111b21] text-right">חשיפת פרטי גישה</p>
                    <div>
                        <label className="text-xs text-[#8696a0] mb-1 block text-right">
                            סיבה לחשיפה <span className="text-red-400">*</span>
                        </label>
                        <textarea rows={2} required value={reason}
                            onChange={e => setReason(e.target.value)}
                            className="input-base resize-none text-right"
                            placeholder="לדוגמה: לקוח שכח סיסמה ומבקש עזרה / שינוי App Password" />
                    </div>
                    {error && <p className="text-xs text-red-500 text-right">{error}</p>}
                    {!tenant.bridgeEmail ? (
                        <p className="text-xs text-[#8696a0] text-center py-2">לא הוגדר מייל תעבורה ללקוח זה</p>
                    ) : (
                        <button type="submit" disabled={loading}
                            className="w-full bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition">
                            {loading ? 'מאמת...' : '🔓 הצג פרטי גישה'}
                        </button>
                    )}
                </form>
            )}

            {/* Audit log */}
            {auditLogs.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-4">
                    <p className="text-xs font-semibold text-[#8696a0] text-right mb-3">היסטוריית חשיפות</p>
                    <div className="space-y-1.5">
                        {auditLogs.map((log, i) => (
                            <div key={log._id || i} className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                                <span className="text-xs text-gray-400 flex-shrink-0">
                                    {new Date(log.createdAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <div className="text-right min-w-0">
                                    <p className="text-xs text-[#111b21] truncate">{log.userEmail}</p>
                                    {log.meta?.reason && <p className="text-xs text-gray-400 truncate">{log.meta.reason}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
