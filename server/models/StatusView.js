import mongoose from 'mongoose';

// צפייה בודדת: איש קשר אחד שצפה בסטטוס אחד.
// ייחודי לכל (חשבון × סטטוס × צופה) — אישור צפייה חוזר לא יוצר כפילות.
const statusViewSchema = new mongoose.Schema({
  accountId:   { type: mongoose.Schema.Types.ObjectId, ref: 'BtbAccount', required: true, index: true },
  statusId:    { type: mongoose.Schema.Types.ObjectId, ref: 'StatusPost', default: null },

  msgId:       { type: String, required: true },         // מזהה הסטטוס — לקישור גם אם StatusPost עוד לא נוצר
  viewerJid:   { type: String, required: true },
  viewerPhone: { type: String, default: '' },
  viewerName:  { type: String, default: '' },
  viewedAt:    { type: Date, default: Date.now },
  receiptType: { type: String, enum: ['read', 'played'], default: 'read' },
}, { timestamps: true });

statusViewSchema.index({ accountId: 1, msgId: 1, viewerJid: 1 }, { unique: true });
statusViewSchema.index({ accountId: 1, viewerJid: 1 });

export default mongoose.model('StatusView', statusViewSchema);
