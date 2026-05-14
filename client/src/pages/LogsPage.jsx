import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/services/api';
import { useSSE } from '@/hooks/useSSE';

const LEVEL_STYLE = {
    debug: { bg: 'bg-gray-50',   text: 'text-gray-400',   badge: 'bg-gray-100 text-gray-500',   dot: 'bg-gray-300' },
    info:  { bg: 'bg-white',     text: 'text-[#111b21]',  badge: 'bg-blue-100 text-blue-600',   dot: 'bg-blue-400' },
    warn:  { bg: 'bg-yellow-50', text: 'text-yellow-800', badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400' },
    error: { bg: 'bg-red-50',    text: 'text-red-800',    badge: 'bg-red-100 text-red-600',     dot: 'bg-red-500' },
    fatal: { bg: 'bg-red-100',   text: 'text-red-900',    badge: 'bg-red-600 text-white',       dot: 'bg-red-700' },
};

const COMPONENT_LABELS = { imap: 'IMAP', wa: 'WhatsApp', pool: 'Pool', server: 'Server', http: 'HTTP', crash: 'CRASH', media: 'Media' };

function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function fmtDate(ts) {
    return new Date(ts).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

export default function LogsPage() {
    const [entries,   setEntries]   = useState([]);
    const [stats,     setStats]     = useState(null);
    const [crash,     setCrash]     = useState(null);
    const [loading,   setLoading]   = useState(true);
    const [autoScroll,setAutoScroll] = useState(true);
    const [filterLvl, setFilterLvl] = useState('');
    const [filterComp,setFilterComp] = useState('');
    const [paused,    setPaused]    = useState(false);
    const bottomRef = useRef(null);

    const fetchLogs = useCallback(async () => {
        if (paused) return;
        try {
            const params = new URLSearchParams({ limit: 500 });
            if (filterLvl)  params.set('level', filterLvl);
            if (filterComp) params.set('component', filterComp);
            const [logsRes, statsRes] = await Promise.all([
                api.get(`/logs?${params}`),
                api.get('/logs/stats'),
            ]);
            setEntries(logsRes.data);
            setStats(statsRes.data);
            setLoading(false);
        } catch (e) { setLoading(false); }
    }, [filterLvl, filterComp, paused]);

    const fetchCrash = useCallback(async () => {
        try {
            const res = await api.get('/logs/crash');
            if (res.data.found) setCrash(res.data);
        } catch (e) {}
    }, []);

    useEffect(() => { fetchLogs(); fetchCrash(); }, [fetchLogs]);
    useSSE(fetchLogs, 500);

    useEffect(() => {
        if (autoScroll && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [entries, autoScroll]);

    const components = [...new Set(entries.map(e => e.component))].filter(Boolean);

    return (
        <div className="min-h-screen bg-[#eae6df] flex flex-col" dir="rtl">

            {/* Header */}
            <div className="bg-[#075E54] text-white px-5 py-3 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="text-lg font-bold">📋 לוג מערכת</div>
                    {stats && (
                        <div className="text-xs text-white/70">
                            PID {stats.process.pid} · {stats.process.uptime}ש׳ פעיל · {stats.process.rss}MB RAM
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <a href="/admin" className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition">
                        ← אדמין
                    </a>
                    <a href="/api/logs/file" className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition">
                        ⬇ הורד לוג
                    </a>
                </div>
            </div>

            {/* Stats bar */}
            {stats && (
                <div className="bg-white border-b border-[#d1d7db] px-5 py-2 flex items-center gap-4 flex-shrink-0 flex-wrap">
                    {Object.entries(stats.counts).map(([lvl, cnt]) => {
                        const s = LEVEL_STYLE[lvl] || {};
                        return cnt > 0 ? (
                            <button key={lvl} onClick={() => setFilterLvl(filterLvl === lvl ? '' : lvl)}
                                className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg border transition
                                    ${filterLvl === lvl ? s.badge + ' border-current' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                {lvl} {cnt}
                            </button>
                        ) : null;
                    })}
                    <div className="flex-1" />
                    <label className="flex items-center gap-1.5 text-xs text-[#8696a0] cursor-pointer">
                        <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="rounded" />
                        גלול אוטומטי
                    </label>
                    <button onClick={() => setPaused(p => !p)}
                        className={`text-xs px-3 py-1 rounded-lg border transition font-medium
                            ${paused ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                        {paused ? '▶ המשך' : '⏸ עצור'}
                    </button>
                    {components.length > 0 && (
                        <select value={filterComp} onChange={e => setFilterComp(e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-[#111b21]">
                            <option value="">כל הרכיבים</option>
                            {components.map(c => <option key={c} value={c}>{COMPONENT_LABELS[c] || c}</option>)}
                        </select>
                    )}
                </div>
            )}

            {/* Crash banner */}
            {crash && (
                <div className="bg-red-600 text-white px-5 py-3 flex-shrink-0">
                    <p className="text-sm font-bold mb-1">⚠️ קריסה אחרונה זוהתה — PID {crash.crash.pid}</p>
                    <p className="text-xs text-red-100">{crash.crash.message} · {new Date(crash.crash.ts).toLocaleString('he-IL')}</p>
                    <details className="mt-2">
                        <summary className="text-xs text-red-200 cursor-pointer">הצג הקשר ({crash.context.length} רשומות)</summary>
                        <div className="mt-2 bg-red-900/50 rounded-lg p-3 space-y-1 max-h-48 overflow-y-auto text-left">
                            {crash.context.map((e, i) => (
                                <div key={i} className="text-xs font-mono text-red-100">
                                    [{fmtTime(e.ts)}] [{e.level.toUpperCase()}] [{e.component}] {e.message}
                                </div>
                            ))}
                        </div>
                    </details>
                </div>
            )}

            {/* Log entries */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="text-center py-16 text-[#8696a0] text-sm">טוען לוגים...</div>
                ) : entries.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-3xl mb-2">📋</p>
                        <p className="text-sm text-[#8696a0]">אין רשומות לוג</p>
                    </div>
                ) : (
                    <div className="font-mono text-xs">
                        {[...entries].reverse().map((e, i) => {
                            const s = LEVEL_STYLE[e.level] || LEVEL_STYLE.info;
                            return (
                                <div key={i} className={`flex items-start gap-3 px-4 py-1.5 border-b border-black/5 hover:brightness-95 transition-all ${s.bg}`}>
                                    <span className="text-[#8696a0] flex-shrink-0 w-24 text-right">
                                        {fmtDate(e.ts)} {fmtTime(e.ts)}
                                    </span>
                                    <span className={`flex-shrink-0 w-12 text-center font-bold uppercase text-[10px] ${s.text}`}>
                                        {e.level}
                                    </span>
                                    <span className="flex-shrink-0 w-16 text-[#8696a0]">
                                        {COMPONENT_LABELS[e.component] || e.component || '—'}
                                    </span>
                                    <span className={`flex-1 ${s.text} leading-relaxed`}>
                                        {e.tenantId && <span className="text-purple-500 mr-1">[{e.tenantId.slice(-6)}]</span>}
                                        {e.message}
                                        {e.stack && (
                                            <details className="mt-1">
                                                <summary className="text-red-400 cursor-pointer">stack trace</summary>
                                                <pre className="text-[10px] text-red-500 whitespace-pre-wrap mt-1">{e.stack}</pre>
                                            </details>
                                        )}
                                    </span>
                                    <span className="flex-shrink-0 text-[#8696a0] text-[10px]">{e.mem}MB</span>
                                </div>
                            );
                        })}
                        <div ref={bottomRef} />
                    </div>
                )}
            </div>

            {/* Live indicator */}
            <div className={`flex-shrink-0 px-4 py-2 text-xs flex items-center gap-2 border-t border-[#d1d7db]
                ${paused ? 'bg-yellow-50 text-yellow-700' : 'bg-white text-[#8696a0]'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${paused ? 'bg-yellow-400' : 'bg-green-400 animate-pulse'}`} />
                {paused ? 'עדכון מושהה' : `עדכון בזמן אמת · ${entries.length} רשומות`}
            </div>
        </div>
    );
}
