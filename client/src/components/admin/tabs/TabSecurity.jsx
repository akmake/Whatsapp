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
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between mb-1">
                <button onClick={copy}
                    className={`text-xs font-medium transition ${copied ? 'text-emerald-600' : 'text-indigo-500 hover:text-indigo-700'}`}>
                    {copied ? '✓ הועתק' : 'העתק'}
                </button>
                <span className="text-xs text-slate-400">{label}</span>
            </div>
            <p className="font-mono text-sm text-slate-800 text-right break-all select-all">{value}</p>
        </div>
    );
}

export default function TabSecurity({ tenantId, tenant }) {
    const [step,      setStep]      = useState('form');
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
        <div className="p-6 space-y-5">

            {/* Warning banner */}
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-right">
                <p className="text-sm font-semibold text-red-700 mb-1">אזור רגיש</p>
                <p className="text-xs text-red-600 leading-relaxed">
                    כל חשיפת סיסמה מתועדת: זמן, כתובת IP, משתמש וסיבה. הגישה מוגבלת ל-15 חשיפות לשעה.
                </p>
            </div>

            {/* Credentials panel */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {step === 'revealed' && creds ? (
                    <div className="p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <button onClick={hide}
                                className="text-xs text-slate-400 hover:text-slate-600 transition">הסתר</button>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-red-500">נסתר בעוד {countdown}ש׳</span>
                                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                            </div>
                        </div>
                        <CopyField label="מייל תעבורה"  value={creds.bridgeEmail} />
                        <CopyField label="App Password" value={creds.bridgeEmailPassword} />
                    </div>
                ) : (
                    <form onSubmit={reveal} className="p-5 space-y-4">
                        <div className="text-right">
                            <h3 className="text-sm font-semibold text-slate-800">חשיפת פרטי גישה</h3>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
                                סיבה לחשיפה <span className="text-red-400">*</span>
                            </label>
                            <textarea rows={2} required value={reason} onChange={e => setReason(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400 transition resize-none text-right"
                                placeholder="לדוגמה: לקוח שכח סיסמה / שינוי App Password" />
                        </div>
                        {error && <p className="text-xs text-red-500 text-right">{error}</p>}
                        {!tenant.bridgeEmail ? (
                            <p className="text-xs text-slate-400 text-center py-2">לא הוגדר מייל תעבורה ללקוח זה</p>
                        ) : (
                            <button type="submit" disabled={loading}
                                className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition">
                                {loading ? 'מאמת...' : '🔓 הצג פרטי גישה'}
                            </button>
                        )}
                    </form>
                )}
            </div>

            {/* Audit log */}
            {auditLogs.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100 text-right">
                        <h3 className="text-xs font-semibold text-slate-500">היסטוריית חשיפות</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {auditLogs.map((log, i) => (
                            <div key={log._id || i} className="px-5 py-3 flex items-start justify-between gap-3">
                                <span className="text-xs text-slate-400 flex-shrink-0">
                                    {new Date(log.createdAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <div className="text-right min-w-0">
                                    <p className="text-xs font-medium text-slate-700 truncate">{log.userEmail}</p>
                                    {log.meta?.reason && <p className="text-xs text-slate-400 truncate">{log.meta.reason}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
