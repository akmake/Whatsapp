import mongoose from 'mongoose';

// חשבון BTB — בעל עסק שמחובר לוואטסאפ לצורך ניהול סטטוסים.
// משתמש באותו מנגנון חיבור (Baileys) כמו WTM, אבל מחוץ ל-tenantPool —
// החיבור נשאר online כדי לתפוס את אישורי הצפייה בסטטוסים.
const btbAccountSchema = new mongoose.Schema({
  name:            { type: String, required: true },
  phone:           { type: String, required: true, unique: true },
  active:          { type: Boolean, default: true },

  // יעד "גרעין העוקבים" — כשמספר הצופים הייחודיים חוצה אותו מתחילים לזקק Top-N
  targetFollowers: { type: Number, default: 1000 },

  // ברירת מחדל לאיכות העלאת סטטוסים
  videoResolution: { type: Number, default: 1080 },   // 1080 / 720

  tags:            [{ type: String }],
  internalNotes:   { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('BtbAccount', btbAccountSchema);
