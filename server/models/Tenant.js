import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema({
  name:                { type: String, required: true },
  phone:               { type: String, required: true, unique: true },
  bridgeEmail:         { type: String, default: '' },
  bridgeEmailPassword: { type: String, default: '' },
  destinationEmail:    { type: String, default: '' },
  active:              { type: Boolean, default: true },

  // Billing & plan
  planType:        { type: String, enum: ['trial', 'monthly', 'annual', 'custom'], default: 'trial' },
  planPrice:       { type: Number, default: 0 },          // ILS per billing cycle
  billingStatus:   { type: String, enum: ['active', 'overdue', 'trial', 'suspended', 'cancelled'], default: 'trial' },
  nextBillingDate: { type: Date,   default: null },

  // Contact
  contractEmail:   { type: String, default: '' },
  tags:            [{ type: String }],
  internalNotes:   { type: String, default: '' },

  // Email reply handling
  emailSignature:  { type: String, default: '' },         // stripped automatically from replies
}, { timestamps: true });

export default mongoose.model('Tenant', tenantSchema);
