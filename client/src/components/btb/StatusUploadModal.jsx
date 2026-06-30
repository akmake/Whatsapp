import { useState, useEffect } from 'react';
import api from '@/services/api';

const BG_COLORS = ['#1F3A5F', '#075E54', '#B23A48', '#6D28D9', '#0F766E', '#B45309', '#111827'];
const SEGMENT_SECONDS = 30;

const fmtSec = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const TYPES = [
    { id: 'image', label: 'תמונה' },
    { id: 'video', label: 'ווידאו' },
    { id: 'text', label: 'טקסט' },
];

export default function StatusUploadModal({ accountId, onClose, onPosted }) {
    const [type, setType]       = useState('image');
    const [file, setFile]       = useState(null);
    const [previewUrl, setPrev] = useState(null);
    const [caption, setCaption] = useState('');
    const [text, setText]       = useState('');
    const [bgColor, setBgColor] = useState(BG_COLORS[0]);
    const [duration, setDur]    = useState(0);
    const [videoQuality, setVideoQuality] = useState('max');
    const [audience, setAud]    = useState(null);
    const [busy, setBusy]       = useState(false);

    useEffect(() => {
        api.get(`/btb/${accountId}/audience`).then(r => setAud(r.data.count)).catch(() => setAud(0));
    }, [accountId]);
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    const onFile = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setFile(f); setPrev(URL.createObjectURL(f)); setDur(0);
    };

    const switchType = (t) => {
        setType(t); setFile(null); setDur(0);
        if (previewUrl) { URL.revokeObjectURL(previewUrl); setPrev(null); }
    };

    const segments = duration ? Math.max(1, Math.ceil(duration / SEGMENT_SECONDS)) : 0;
    const canSubmit = (type === 'text' ? text.trim() : !!file) && !busy;

    const submit = async () => {
        setBusy(true);
        try {
            const fd = new FormData();
            fd.append('type', type);
            if (type === 'video') fd.append('videoQuality', videoQuality);
            if (type === 'text') { fd.append('caption', text); fd.append('bgColor', bgColor); }
            else { fd.append('file', file); fd.append('caption', caption); }
            // ההעלאה רצה ברקע בשרת (וידאו כבד לוקח זמן) — מקבלים jobId וסוקרים עד שמסתיים
            const { data } = await api.post(`/btb/${accountId}/status`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            const jobId = data.jobId;
            const deadline = Date.now() + 600_000; // עד 10 דקות לסרטונים כבדים
            while (Date.now() < deadline) {
                await new Promise(r => setTimeout(r, 2500));
                const job = (await api.get(`/btb/${accountId}/status-job/${jobId}`)).data;
                if (job.status === 'done')  { onPosted?.(job.result); onClose(); return; }
                if (job.status === 'error') throw new Error(job.error);
                if (job.status === 'notfound') throw new Error('ההעלאה אבדה (השרת אותחל?)');
            }
            throw new Error('ההעלאה לוקחת יותר מדי זמן — נסה סרטון קצר/קל יותר');
        } catch (err) {
            alert(err.message || err.response?.data?.error || 'שגיאה בהעלאת הסטטוס');
        } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-[#111b21]">העלאת סטטוס</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                </div>

                {/* type tabs */}
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
                    {TYPES.map(t => (
                        <button key={t.id} onClick={() => switchType(t.id)}
                            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition ${type === t.id ? 'bg-white shadow text-[#111b21]' : 'text-gray-500'}`}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* preview */}
                <div className="rounded-xl bg-gray-900 overflow-hidden mb-4 flex items-center justify-center relative" style={{ aspectRatio: '9 / 16', maxHeight: '46vh', margin: '0 auto' }}>
                    {type === 'text' ? (
                        <div className="w-full h-full flex items-center justify-center p-6 text-white text-center text-xl font-medium break-words" style={{ backgroundColor: bgColor }}>
                            {text || 'הקלד טקסט…'}
                        </div>
                    ) : !previewUrl ? (
                        <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-gray-400 gap-2">
                            <span className="text-4xl">{type === 'image' ? '🖼️' : '🎬'}</span>
                            <span className="text-sm">בחר {type === 'image' ? 'תמונה' : 'ווידאו'}</span>
                            <input type="file" accept={type === 'image' ? 'image/*' : 'video/*'} onChange={onFile} className="hidden" />
                        </label>
                    ) : type === 'image' ? (
                        <>
                            <img src={previewUrl} alt="" className="w-full h-full object-contain" />
                            {caption && <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-sm px-3 py-2 text-center">{caption}</div>}
                        </>
                    ) : (
                        <>
                            <video src={previewUrl} className="w-full h-full object-contain" controls
                                onLoadedMetadata={e => setDur(e.target.duration || 0)} />
                            {/* segment story-bars */}
                            {segments > 1 && (
                                <div className="absolute top-2 inset-x-2 flex gap-1">
                                    {Array.from({ length: segments }).map((_, i) => (
                                        <div key={i} className="flex-1 h-1 rounded-full bg-white/80" />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* video segment info */}
                {type === 'video' && previewUrl && (
                    <>
                        <p className="text-xs text-center mb-3 text-gray-500">
                            {duration ? <>אורך {fmtSec(duration)} · ייחתך ל-<b>{segments}</b> סטטוסים ({segments} × עד 30ש')</> : 'טוען פרטי ווידאו…'}
                        </p>
                        <div className="grid grid-cols-2 gap-2 mb-4" role="radiogroup" aria-label="איכות וידאו">
                            <button type="button" onClick={() => setVideoQuality('max')}
                                className={`text-right rounded-xl border p-3 transition ${videoQuality === 'max' ? 'border-[#1daa61] bg-[#e9f8ef]' : 'border-gray-200 bg-white'}`}>
                                <span className="block text-sm font-semibold text-[#111b21]">איכות מרבית</span>
                                <span className="block text-[11px] text-gray-500 mt-1">הכי קרוב למקור</span>
                            </button>
                            <button type="button" onClick={() => setVideoQuality('optimized')}
                                className={`text-right rounded-xl border p-3 transition ${videoQuality === 'optimized' ? 'border-[#1daa61] bg-[#e9f8ef]' : 'border-gray-200 bg-white'}`}>
                                <span className="block text-sm font-semibold text-[#111b21]">חיסכון חכם</span>
                                <span className="block text-[11px] text-gray-500 mt-1">קובץ קטן, איכות גבוהה</span>
                            </button>
                        </div>
                    </>
                )}

                {/* caption / text input */}
                {type === 'text' ? (
                    <>
                        <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="הטקסט שלך…"
                            className="w-full mb-3 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
                        <div className="flex gap-2 mb-4">
                            {BG_COLORS.map(c => (
                                <button key={c} onClick={() => setBgColor(c)}
                                    className={`w-7 h-7 rounded-full border-2 ${bgColor === c ? 'border-gray-800' : 'border-transparent'}`}
                                    style={{ backgroundColor: c }} />
                            ))}
                        </div>
                    </>
                ) : previewUrl && (
                    <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="כיתוב (יופיע מתחת לסטטוס)…"
                        className="w-full mb-4 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                )}

                {/* audience + submit */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                        {audience === null ? 'בודק נמענים…' : `יישלח ל-${audience.toLocaleString()} אנשי קשר`}
                    </span>
                    <button onClick={submit} disabled={!canSubmit}
                        className="px-5 py-2 rounded-lg text-white font-semibold transition disabled:opacity-40"
                        style={{ backgroundColor: '#1F3A5F' }}>
                        {busy ? 'מעלה…' : 'פרסם'}
                    </button>
                </div>
                {busy && type === 'video' && <p className="text-xs text-gray-400 mt-2 text-center">מעבד ווידאו (קידוד + חיתוך) — עשוי לקחת מספר שניות…</p>}
            </div>
        </div>
    );
}
