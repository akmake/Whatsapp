import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: node scripts/createAdmin.js <email> <password>');
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);

const existing = await User.findOne({ email });
if (existing) {
  console.log('משתמש עם אימייל זה כבר קיים.');
  await mongoose.disconnect();
  process.exit(0);
}

await User.create({ email, password, role: 'admin' });
console.log(`✓ אדמין נוצר: ${email}`);
await mongoose.disconnect();
