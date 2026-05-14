import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';
import { useSSE } from '@/hooks/useSSE';
import TenantSidebar from '@/components/admin/TenantSidebar';
import TenantPanel from '@/components/admin/TenantPanel';
import AddTenantModal from '@/components/admin/modals/AddTenantModal';
import EditTenantModal from '@/components/admin/modals/EditTenantModal';
import QRModal from '@/components/admin/modals/QRModal';
import ComposeModal from '@/components/admin/modals/ComposeModal';

export default function AdminPage() {
    const [tenants, setTenants]       = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [showAdd, setShowAdd]       = useState(false);
    const [editTenant, setEditTenant] = useState(null);
    const [qrModal, setQrModal]       = useState(null);
    const [qrLoading, setQrLoading]   = useState(false);
    const [compose, setCompose]       = useState(null);

    const fetchTenants = useCallback(async () => {
        try { setTenants((await api.get('/tenants')).data); }
        catch (e) { console.error(e); }
    }, []);

    useEffect(() => { fetchTenants(); }, [fetchTenants]);
    useSSE(fetchTenants);

    const handleDelete = async (id, name) => {
        if (!confirm(`למחוק את "${name}"?`)) return;
        await api.delete(`/tenants/${id}`);
        if (selectedId === id) setSelectedId(null);
        fetchTenants();
    };

    const openQR = async (t) => {
        setQrLoading(true);
        try {
            const res = await api.get(`/tenants/${t._id}/qr`);
            setQrModal({ id: t._id, qr: res.data.qr, name: t.name });
        } catch (e) {
            alert(e.response?.data?.error || 'QR לא זמין כרגע');
        } finally {
            setQrLoading(false);
        }
    };

    const selected = tenants.find(t => t._id === selectedId);

    return (
        <div className="flex h-full" style={{ direction: 'ltr' }}>
            <TenantSidebar
                tenants={tenants}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onAdd={() => setShowAdd(true)}
            />

            <div className="flex-1 flex flex-col overflow-hidden bg-slate-50" style={{ direction: 'rtl' }}>
                {selected ? (
                    <TenantPanel
                        key={selected._id}
                        tenant={selected}
                        onQR={() => openQR(selected)}
                        qrLoading={qrLoading}
                        onReconnect={() => api.post(`/tenants/${selected._id}/reconnect`).then(fetchTenants)}
                        onDelete={() => handleDelete(selected._id, selected.name)}
                        onEdit={() => setEditTenant(selected)}
                        onCompose={() => setCompose({ tenantId: selected._id, name: selected.name })}
                        onEmailSaved={fetchTenants}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none">
                        <div className="w-20 h-20 rounded-2xl bg-slate-200 flex items-center justify-center mb-5 text-4xl">👥</div>
                        <h3 className="text-xl font-semibold text-slate-700 mb-1.5">בחר לקוח</h3>
                        <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
                            בחר לקוח מהרשימה כדי לצפות ולנהל את הגדרותיו
                        </p>
                        {tenants.length === 0 && (
                            <button onClick={() => setShowAdd(true)}
                                className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-semibold text-sm transition shadow-sm">
                                + הוסף לקוח ראשון
                            </button>
                        )}
                    </div>
                )}
            </div>

            {showAdd    && <AddTenantModal onClose={() => setShowAdd(false)} onAdded={fetchTenants} />}
            {editTenant && <EditTenantModal tenant={editTenant} onClose={() => setEditTenant(null)} onSaved={fetchTenants} />}
            {qrModal    && <QRModal qrModal={qrModal} onClose={() => setQrModal(null)} />}
            {compose    && <ComposeModal tenantId={compose.tenantId} name={compose.name} onClose={() => setCompose(null)} />}
        </div>
    );
}
