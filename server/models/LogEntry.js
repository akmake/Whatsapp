import mongoose from 'mongoose';

const logSchema = new mongoose.Schema({
    ts:        { type: Date,   required: true },
    level:     { type: String, enum: ['debug', 'info', 'warn', 'error', 'fatal'], index: true },
    component: { type: String, default: '' },
    tenantId:  { type: String, default: null, index: true },
    message:   { type: String, default: '' },
    pid:       { type: Number },
    mem:       { type: Number },
    stack:     { type: String },
    data:      { type: Object },
}, { _id: true });

logSchema.index({ ts: -1 });
logSchema.index({ level: 1, ts: -1 });
// TTL: מחיקה אוטומטית אחרי 30 יום
logSchema.index({ ts: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.model('LogEntry', logSchema);
