import mongoose from 'mongoose';

// סטטוס בודד שעלה (או שזוהה שעלה) עבור חשבון BTB.
// ווידאו ארוך שנחתך למקטעים => כמה StatusPost עם אותו batchId.
const statusPostSchema = new mongoose.Schema({
  accountId:    { type: mongoose.Schema.Types.ObjectId, ref: 'BtbAccount', required: true, index: true },

  msgId:        { type: String, required: true },        // WA message key id (status@broadcast)
  postedAt:     { type: Date, default: Date.now },
  mediaType:    { type: String, enum: ['image', 'video', 'text'], required: true },
  caption:      { type: String, default: '' },

  // העלאות שלנו / חיתוך ווידאו ארוך
  source:       { type: String, enum: ['upload', 'phone'], default: 'phone' }, // הועלה דרכנו / זוהה מהטלפון
  batchId:      { type: String, default: null },         // מקבץ מקטעים של אותה העלאה
  segmentIndex: { type: Number, default: 0 },
  segmentCount: { type: Number, default: 1 },

  // דנורמליזציה לתצוגה מהירה בדשבורד
  viewsCount:   { type: Number, default: 0 },
}, { timestamps: true });

statusPostSchema.index({ accountId: 1, msgId: 1 }, { unique: true });
statusPostSchema.index({ accountId: 1, postedAt: -1 });

export default mongoose.model('StatusPost', statusPostSchema);
