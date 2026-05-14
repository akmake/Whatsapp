import AuditLog from '../models/AuditLog.js';

export const audit = async (req, action, tenantId = null, meta = {}) => {
    try {
        await AuditLog.create({
            userEmail: req.user?.email || 'system',
            action,
            tenantId:  tenantId || null,
            ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '',
            meta,
        });
    } catch (e) {
        console.error('[audit]', e.message);
    }
};
