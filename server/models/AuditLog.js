import mongoose from 'mongoose';

const auditSchema = new mongoose.Schema({
    userEmail: { type: String, default: '' },
    action:    { type: String, required: true },
    tenantId:  { type: String, default: null,  index: true },
    ip:        { type: String, default: '' },
    meta:      { type: Object, default: {} },
    createdAt: { type: Date,   default: Date.now },
});

auditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 }); // auto-expire after 1 year
auditSchema.index({ tenantId: 1, createdAt: -1 });

export default mongoose.model('AuditLog', auditSchema);
