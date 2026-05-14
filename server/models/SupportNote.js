import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema({
    tenantId:   { type: String, required: true, index: true },
    content:    { type: String, required: true },
    priority:   { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    resolved:   { type: Boolean, default: false },
    resolvedAt: { type: Date,    default: null },
    createdBy:  { type: String,  default: '' },
}, { timestamps: true });

export default mongoose.model('SupportNote', noteSchema);
