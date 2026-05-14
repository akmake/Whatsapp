import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
    tenantId:  { type: String, required: true, index: true },
    amount:    { type: Number, required: true },
    method:    { type: String, enum: ['credit', 'bank', 'cash', 'bit', 'paybox', 'other'], default: 'other' },
    period:    { type: String, default: '' },   // e.g. "01/2025"
    paidAt:    { type: Date,   default: Date.now },
    notes:     { type: String, default: '' },
    createdBy: { type: String, default: '' },   // admin email
}, { timestamps: true });

export default mongoose.model('Payment', paymentSchema);
