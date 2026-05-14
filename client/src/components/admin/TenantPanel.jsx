import { useState } from 'react';
import api from '@/services/api';
import { WA_STATUS } from './constants';
import WaBtn from '@/components/ui/WaBtn';
import TabInfo     from './tabs/TabInfo';
import TabEmail    from './tabs/TabEmail';
import TabPayments from './tabs/TabPayments';
import TabNotes    from './tabs/TabNotes';
import TabSecurity from './tabs/TabSecurity';

const BILLING_DOT = {
    active:    'bg-green-500',
    overdue:   'bg-red-500',
    trial:     'bg-blue-400',
    suspended: 'bg-gray-400',
    cancelled: 'bg-gray-300',
};

const TABS = [
    { key: 'info',     label: 'פרטים' },
    { key: 'email',    label: 'מייל' },
    { key: 'payments', label: 'תשלומים' },
    { key: 'notes',    label: 'תמיכה' },
    { key: 'security', label: 'אבטחה' },
];

export default function TenantPanel({ tenant: t, onQR, qrLoading, onReconnect, onDelete, onEdit, onCompose, onEmailSaved }) {
    const [activeTab, setActiveTab] = useState('info');
    const s = WA_STATUS[t.waStatus] || WA_STATUS.disconnected;

    return (
        <div className="flex flex-col h-full">

            {/* Header */}
            <div className="bg-[#f0f2f5] px-4 py-2.5 flex items-center justify-between flex-shrink-0 border-b border-[#d1d7db]">
                <div className="flex items-center gap-2 flex-wrap">
                    <WaBtn onClick={onDelete} red>מחק</WaBtn>
                    <WaBtn onClick={onEdit}>ערוך</WaBtn>
                    {t.waStatus === 'connected'    && <WaBtn onClick={onCompose} green>שלח הודעה</WaBtn>}
                    {t.waStatus === 'waiting_qr'   && (
                        <WaBtn onClick={onQR} disabled={qrLoading}>
                            {qrLoading ? '⏳ מחכה ל-QR...' : 'הצג QR'}
                        </WaBtn>
                    )}
                    {t.waStatus === 'disconnected' && <WaBtn onClick={onReconnect} yellow>חבר מחדש</WaBtn>}
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className="font-semibold text-[#111b21] text-sm">{t.name}</p>
                        <div className="flex items-center gap-1.5 justify-end">
                            <span className={`w-1.5 h-1.5 rounded-full ${BILLING_DOT[t.billingStatus] || 'bg-gray-300'}`} />
                            <span className="text-xs text-[#8696a0]">{s.text}</span>
                        </div>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-[#dfe5e7] flex items-center justify-center text-[#075E54] font-bold text-base flex-shrink-0">
                        {t.name.charAt(0).toUpperCase()}
                    </div>
                </div>
            </div>

            {/* Tab bar */}
            <div className="flex bg-white border-b border-[#d1d7db] flex-shrink-0 overflow-x-auto">
                {TABS.map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        className={`flex-1 min-w-0 py-2.5 text-xs font-medium transition border-b-2 whitespace-nowrap px-2 ${
                            activeTab === tab.key
                                ? 'border-[#25D366] text-[#075E54]'
                                : 'border-transparent text-[#8696a0] hover:text-[#111b21]'
                        } ${tab.key === 'security' ? 'text-red-400 hover:text-red-600' : ''}`}>
                        {tab.key === 'overdue' ? '🔴 ' : ''}{tab.label}
                        {tab.key === 'notes'    && t.billingStatus === 'overdue' ? ' ⚠' : ''}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto" style={{ backgroundColor: '#eae6df' }}>
                {activeTab === 'info'     && <TabInfo     tenant={t} onSaved={onEmailSaved} />}
                {activeTab === 'email'    && <TabEmail    tenant={t} onSaved={onEmailSaved} />}
                {activeTab === 'payments' && <TabPayments tenantId={t._id} />}
                {activeTab === 'notes'    && <TabNotes    tenantId={t._id} />}
                {activeTab === 'security' && <TabSecurity tenantId={t._id} tenant={t} />}
            </div>
        </div>
    );
}
