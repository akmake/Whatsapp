import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema({
  name:                { type: String, required: true },
  phone:               { type: String, required: true, unique: true },
  bridgeEmail:         { type: String, default: '' },
  bridgeEmailPassword: { type: String, default: '' },
  destinationEmail:    { type: String, default: '' },
  active:              { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('Tenant', tenantSchema);
