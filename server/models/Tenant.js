import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  emailPassword: { type: String, required: true },
  emailHost: { type: String, default: 'imap.gmail.com' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('Tenant', tenantSchema);
