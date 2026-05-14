import { useState } from 'react';
import api from '@/services/api';
import Modal from '@/components/ui/Modal';
import Field from '@/components/ui/Field';

export default function EditTenantModal({ tenant, onClose, onSaved }) {
    const [form, setForm] = useState({ name: tenant.name, phone: tenant.phone });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true); setError('');
        try {
            await api.put(`/tenants/${tenant._id}/info`, form);
            onSaved();
            onClose();
        } catch (err) { setError(err.response?.data?.error || 'שגיאה'); }
        finally { setLoading(false); }
    };

    return (
        <Modal onClose={onClose}>
            <h3 className="text-lg font-bold mb-1 text-[#111b21]">עריכת לקוח</h3>
            <p className="text-sm text-[#8696a0] mb-5">ערוך שם ומספר וואצאפ</p>
            <form onSubmit={handleSubmit} className="space-y-3">
                <Field label="שם הלקוח">
                    <input className="input-base" placeholder="משה לוי"
                        value={form.name}
                        onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
                </Field>
                <Field label="מספר וואצאפ">
                    <input className="input-base" placeholder="972501234567"
                        value={form.phone}
                        onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} required />
                </Field>
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <div className="flex gap-2 pt-1">
                    <button type="submit" disabled={loading}
                        className="flex-1 bg-[#25D366] text-white py-2.5 rounded-xl font-medium hover:bg-[#1fb954] disabled:opacity-50 transition text-sm">
                        {loading ? '...' : 'שמור'}
                    </button>
                    <button type="button" onClick={onClose}
                        className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl font-medium hover:bg-gray-200 transition text-sm">
                        ביטול
                    </button>
                </div>
            </form>
        </Modal>
    );
}
