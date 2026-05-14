import { useState, useEffect } from 'react';
import api from '@/services/api';

const PRIORITY = {
    low:      { label: 'נמוכה',  color: 'text-green-600',  bg: 'bg-green-50  border-green-200' },
    medium:   { label: 'בינונית',color: 'text-blue-600',   bg: 'bg-blue-50   border-blue-200' },
    high:     { label: 'גבוהה',  color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
    critical: { label: 'קריטי',  color: 'text-red-600',    bg: 'bg-red-50    border-red-200' },
};

export default function TabNotes({ tenantId }) {
    const [notes,    setNotes]    = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [content,  setContent]  = useState('');
    const [priority, setPriority] = useState('medium');
    const [saving,   setSaving]   = useState(false);

    const load = async () => {
        setLoading(true);
        try { setNotes((await api.get(`/tenants/${tenantId}/notes`)).data); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [tenantId]);

    const add = async (e) => {
        e.preventDefault(); setSaving(true);
        try {
            await api.post(`/tenants/${tenantId}/notes`, { content, priority });
            setShowForm(false); setContent(''); setPriority('medium'); load();
        } finally { setSaving(false); }
    };

    const toggleResolve = async (note) => {
        await api.put(`/tenants/${tenantId}/notes/${note._id}`, { resolved: !note.resolved });
        load();
    };

    const del = async (id) => {
        if (!confirm('למחוק הערה זו?')) return;
        await api.delete(`/tenants/${tenantId}/notes/${id}`);
        load();
    };

    const open   = notes.filter(n => !n.resolved);
    const closed = notes.filter(n =>  n.resolved);

    return (
        <div className="p-5 space-y-4">

            <button onClick={() => setShowForm(s => !s)}
                className="w-full bg-[#25D366] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#1fb954] transition">
                {showForm ? 'ביטול' : '+ הוסף הערת תמיכה'}
            </button>

            {showForm && (
                <form onSubmit={add} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
                    <div>
                        <label className="text-xs text-[#8696a0] mb-1 block">עדיפות</label>
                        <div className="flex gap-2">
                            {Object.entries(PRIORITY).map(([k, v]) => (
                                <button key={k} type="button" onClick={() => setPriority(k)}
                                    className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition ${priority === k ? v.bg + ' ' + v.color + ' border-current' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                                    {v.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-[#8696a0] mb-1 block">תוכן ההערה</label>
                        <textarea required rows={3} value={content} onChange={e => setContent(e.target.value)}
                            className="input-base resize-none" placeholder="תאר את הבעיה או הפעולה הנדרשת..." />
                    </div>
                    <button type="submit" disabled={saving}
                        className="w-full bg-[#075E54] text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
                        {saving ? 'שומר...' : 'הוסף הערה'}
                    </button>
                </form>
            )}

            {loading ? (
                <div className="text-center py-8 text-[#8696a0] text-sm">טוען...</div>
            ) : notes.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-xl shadow-sm">
                    <p className="text-3xl mb-2">✅</p>
                    <p className="text-sm text-[#8696a0]">אין הערות פתוחות</p>
                </div>
            ) : (
                <>
                    {open.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-[#8696a0] text-right">פתוחות ({open.length})</p>
                            {open.map(n => <NoteCard key={n._id} note={n} onToggle={toggleResolve} onDelete={del} />)}
                        </div>
                    )}
                    {closed.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-[#8696a0] text-right mt-2">סגורות ({closed.length})</p>
                            {closed.map(n => <NoteCard key={n._id} note={n} onToggle={toggleResolve} onDelete={del} />)}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function NoteCard({ note: n, onToggle, onDelete }) {
    const p = PRIORITY[n.priority] || PRIORITY.medium;
    return (
        <div className={`bg-white rounded-xl shadow-sm p-4 ${n.resolved ? 'opacity-60' : ''}`}>
            <div className="flex items-start gap-3">
                <button onClick={() => onDelete(n._id)} className="text-gray-200 hover:text-red-400 transition text-lg leading-none flex-shrink-0 mt-0.5">×</button>
                <div className="flex-1 text-right">
                    <div className="flex items-center justify-end gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${p.bg} ${p.color}`}>{p.label}</span>
                        <span className="text-xs text-[#8696a0]">{new Date(n.createdAt).toLocaleDateString('he-IL')}</span>
                        <span className="text-xs text-[#8696a0]">{n.createdBy?.split('@')[0]}</span>
                    </div>
                    <p className={`text-sm text-[#111b21] leading-relaxed ${n.resolved ? 'line-through text-gray-400' : ''}`}>{n.content}</p>
                </div>
                <button onClick={() => onToggle(n)} title={n.resolved ? 'פתח מחדש' : 'סמן כפתור'}
                    className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 transition ${n.resolved ? 'bg-[#25D366] border-[#25D366]' : 'border-gray-300 hover:border-[#25D366]'}`}>
                    {n.resolved && <span className="text-white text-xs flex items-center justify-center w-full h-full leading-none">✓</span>}
                </button>
            </div>
        </div>
    );
}
