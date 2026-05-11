import mongoose from 'mongoose';

const systemConfigSchema = new mongoose.Schema({
    systemEmail:         { type: String, default: '' },
    systemEmailPassword: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('SystemConfig', systemConfigSchema);
