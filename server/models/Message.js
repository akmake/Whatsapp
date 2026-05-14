import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    tenantId:   { type: String, required: true, index: true },
    phone:      { type: String, required: true },
    senderName: { type: String, default: '' },
    direction:  { type: String, enum: ['in', 'out'], required: true },
    text:       { type: String, default: '' },
    mediaPath:  { type: String, default: null }, // path to saved image on disk
    createdAt:  { type: Date, default: Date.now, index: true },
});

messageSchema.index({ tenantId: 1, phone: 1, createdAt: 1 });

export default mongoose.model('Message', messageSchema);
