import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8, select: false },
  role:     { type: String, enum: ['admin', 'client'], default: 'admin' },
  // ללקוח (role:'client') — חשבון ה-BTB היחיד שהוא רואה ומנהל
  btbAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'BtbAccount', default: null },
  name:     { type: String, default: '' },   // שם תצוגה / שם העסק
  active:   { type: Boolean, default: true }, // השבתת גישה בלי למחוק
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.correctPassword = async function (candidate, hashed) {
  return bcrypt.compare(candidate, hashed);
};

export default mongoose.model('User', userSchema);
