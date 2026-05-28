import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    tenantId:   { type: String, required: true, index: true },
    phone:      { type: String, required: true },
    senderName: { type: String, default: '' },
    direction:  { type: String, enum: ['in', 'out'], required: true },
    text:       { type: String, default: '' },
    mediaPath:  { type: String, default: null },
    mediaType:  { type: String, default: null }, // image | video | audio | document
    groupJid:   { type: String, default: null }, // group ID (without @g.us), null for DMs
    groupName:  { type: String, default: null }, // group display name
    createdAt:  { type: Date, default: Date.now },
});

messageSchema.index({ tenantId: 1, phone: 1, createdAt: 1 });
messageSchema.index({ tenantId: 1, groupJid: 1, createdAt: 1 });
messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // auto-delete after 30 days

export default mongoose.model('Message', messageSchema);
