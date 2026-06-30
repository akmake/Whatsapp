import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import BtbAccount from '../models/BtbAccount.js';
import StatusPost from '../models/StatusPost.js';
import StatusView from '../models/StatusView.js';
import User from '../models/User.js';
import * as statusManager from '../services/statusManager.js';
import { restrictTo } from '../middlewares/authMiddleware.js';
import { audit } from '../utils/audit.js';

const router = express.Router();

const oid = (id) => new mongoose.Types.ObjectId(id);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024 } });

// ─── הגבלת גישה ללקוח: מותר לגעת רק בחשבון שלו ───────────────────
// admin = גישה מלאה; client = רק req.user.btbAccountId. רץ לכל route עם :id.
router.param('id', (req, res, next, id) => {
  if (req.user.role !== 'admin' && String(id) !== String(req.user.btbAccountId || '')) {
    return res.status(403).json({ error: 'אין לך הרשאה לחשבון זה' });
  }
  next();
});

// ─── מספר נמענים (אנשי קשר) שיראו סטטוס ──────────────────────────
router.get('/:id/audience', (req, res) => {
  res.json({ count: statusManager.getAudienceSize(req.params.id) });
});

// ─── העלאת סטטוס (תמונה/ווידאו/טקסט) — עבודת-רקע, מחזיר jobId ─────
// וידאו כבד => העיבוד רץ ברקע ולא מחזיק את הבקשה (אחרת 504). הלקוח סוקר את ה-job.
router.post('/:id/status', upload.single('file'), (req, res) => {
  const { type, caption = '', bgColor = '', font } = req.body;
  const videoQuality = req.body.videoQuality === 'optimized' ? 'optimized' : 'max';
  const buffer = req.file?.buffer;
  if ((type === 'image' || type === 'video') && !buffer) return res.status(400).json({ error: 'חסר קובץ' });
  if (type === 'text' && !caption) return res.status(400).json({ error: 'חסר טקסט' });
  try {
    const jobId = statusManager.startStatusUpload(req.params.id, {
      type, buffer, caption, bgColor,
      font: font ? parseInt(font) : undefined,
      videoQuality,
    });
    res.json({ jobId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/status-job/:jobId', (req, res) => {
  res.json(statusManager.getStatusUpload(req.params.jobId));
});

// ─── בדיקת איכות: עבודת-רקע (POST מפעיל ומחזיר testId; GET סוקר תוצאה) ──
// הבקשה לא מחזיקה את החיבור פתוח לכל המסע => אין ERR_CONNECTION_RESET.
router.post('/:id/status-test', restrictTo('admin'), upload.single('file'), (req, res) => {
  const buffer = req.file?.buffer;
  if (!buffer) return res.status(400).json({ error: 'חסר קובץ' });
  const type = req.body.type || (req.file.mimetype?.startsWith('video') ? 'video' : 'image');
  try {
    const videoQuality = req.body.videoQuality === 'optimized' ? 'optimized' : 'max';
    const testId = statusManager.startQualityTest(req.params.id, { type, buffer, videoQuality });
    res.json({ testId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/status-test/:testId', (req, res) => {
  res.json(statusManager.getQualityTest(req.params.testId));
});

// ─── חשבונות BTB + סטטוס חיבור (admin=הכל, client=שלו בלבד) ───────
router.get('/', async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { _id: req.user.btbAccountId };
  const accounts = await BtbAccount.find(filter).sort({ createdAt: -1 });

  // למנהל — נצרף את אימייל הכניסה של הלקוח המקושר לכל חשבון
  let emailByAccount = {};
  if (req.user.role === 'admin') {
    const clients = await User.find({ role: 'client' }).select('email btbAccountId active').lean();
    emailByAccount = Object.fromEntries(clients.map(c => [String(c.btbAccountId), { email: c.email, active: c.active }]));
  }

  const result = accounts.map(a => ({
    _id: a._id,
    name: a.name,
    phone: a.phone,
    active: a.active,
    targetFollowers: a.targetFollowers,
    videoResolution: a.videoResolution,
    tags: a.tags,
    internalNotes: a.internalNotes,
    createdAt: a.createdAt,
    waStatus: statusManager.getStatus(a._id.toString()),
    client: emailByAccount[String(a._id)] || null, // { email, active } או null אם אין כניסת לקוח
  }));
  res.json(result);
});

// ─── חשבון בודד (meta) — לכותרת הדשבורד ──────────────────────────
router.get('/:id', async (req, res) => {
  const a = await BtbAccount.findById(req.params.id);
  if (!a) return res.status(404).json({ error: 'חשבון לא נמצא' });
  let client = null;
  if (req.user.role === 'admin') {
    const c = await User.findOne({ role: 'client', btbAccountId: a._id }).select('email active').lean();
    if (c) client = { email: c.email, active: c.active };
  }
  res.json({
    _id: a._id, name: a.name, phone: a.phone, active: a.active,
    targetFollowers: a.targetFollowers, createdAt: a.createdAt,
    waStatus: statusManager.getStatus(a._id.toString()), client,
  });
});

// ─── יצירת חשבון + (אופציונלי) כניסת לקוח מקושרת ──────────────────
router.post('/', restrictTo('admin'), async (req, res) => {
  const { name, phone, email, password } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'שם ומספר טלפון הם חובה' });
  if ((email && !password) || (password && !email))
    return res.status(400).json({ error: 'לכניסת לקוח צריך גם אימייל וגם סיסמה' });

  const account = await BtbAccount.create({ name, phone });

  // אם סופקו פרטי כניסה — יוצרים משתמש לקוח מקושר לחשבון
  let client = null;
  if (email && password) {
    try {
      client = await User.create({ email, password, role: 'client', btbAccountId: account._id, name });
    } catch (err) {
      await BtbAccount.findByIdAndDelete(account._id); // גלגול אחורה אם הכניסה נכשלה
      const msg = err.code === 11000 ? 'האימייל כבר קיים במערכת'
        : err.errors?.password ? 'הסיסמה חייבת לפחות 8 תווים' : err.message;
      return res.status(400).json({ error: msg });
    }
  }

  await statusManager.connect(account._id.toString());
  await audit(req, 'btb.create', account._id.toString(), { name, phone, clientEmail: email || null });

  res.status(201).json({ _id: account._id, name, phone, waStatus: 'connecting', client: client ? { email: client.email, active: true } : null });
});

// ─── עדכון חשבון ─────────────────────────────────────────────────
router.put('/:id', restrictTo('admin'), async (req, res) => {
  const { name, targetFollowers, videoResolution, tags, internalNotes, active } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (targetFollowers !== undefined) update.targetFollowers = targetFollowers;
  if (videoResolution !== undefined) update.videoResolution = videoResolution;
  if (tags !== undefined) update.tags = tags;
  if (internalNotes !== undefined) update.internalNotes = internalNotes;
  if (active !== undefined) update.active = active;

  const account = await BtbAccount.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!account) return res.status(404).json({ error: 'חשבון לא נמצא' });
  res.json(account);
});

// ─── ניהול כניסת הלקוח לחשבון (admin): יצירה / איפוס סיסמה / השבתה ──
router.put('/:id/client', restrictTo('admin'), async (req, res) => {
  const { email, password, active } = req.body;
  const accountId = req.params.id;
  try {
    let client = await User.findOne({ role: 'client', btbAccountId: accountId });
    if (!client) {
      if (!email || !password) return res.status(400).json({ error: 'ליצירת כניסה צריך אימייל וסיסמה' });
      const account = await BtbAccount.findById(accountId);
      client = await User.create({ email, password, role: 'client', btbAccountId: accountId, name: account?.name || '' });
    } else {
      if (email) client.email = email;
      if (password) client.password = password;       // יעבור hash ב-pre('save')
      if (active !== undefined) client.active = active;
      await client.save();
    }
    res.json({ client: { email: client.email, active: client.active } });
  } catch (err) {
    res.status(400).json({ error: err.code === 11000 ? 'האימייל כבר קיים' : (err.errors?.password ? 'הסיסמה חייבת לפחות 8 תווים' : err.message) });
  }
});

// ─── QR לחיבור ───────────────────────────────────────────────────
router.get('/:id/qr', restrictTo('admin'), async (req, res) => {
  const id = req.params.id;
  // מתחברים רק אם אין סוקט חי — כדי לא להפיל QR קיים שכבר מוצג למשתמש.
  // אם כבר יש סשן (waiting_qr/connecting) פשוט נחזיר את ה-QR הנוכחי.
  if (statusManager.getStatus(id) === 'disconnected') await statusManager.connect(id);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const qr = statusManager.getQR(id);
    if (qr) return res.json({ qr });
    if (statusManager.isConnected(id)) return res.json({ connected: true });
    await new Promise(r => setTimeout(r, 500));
  }
  res.status(408).json({ error: 'לא התקבל QR תוך 30 שניות — נסה שוב' });
});

router.post('/:id/reconnect', restrictTo('admin'), async (req, res) => {
  await statusManager.connect(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/reset-session', restrictTo('admin'), async (req, res) => {
  statusManager.reset(req.params.id);
  await statusManager.connect(req.params.id);
  res.json({ ok: true });
});

// ─── מחיקת חשבון (כולל נתוני סטטוסים/צפיות) ──────────────────────
router.delete('/:id', restrictTo('admin'), async (req, res) => {
  const id = req.params.id;
  await audit(req, 'btb.delete', id);
  statusManager.reset(id);
  await Promise.all([
    BtbAccount.findByIdAndDelete(id),
    StatusPost.deleteMany({ accountId: id }),
    StatusView.deleteMany({ accountId: id }),
    User.deleteMany({ btbAccountId: id }), // מוחקים גם את כניסת הלקוח המקושרת
  ]);
  res.json({ ok: true });
});

// ─── סיכום לדשבורד ───────────────────────────────────────────────
router.get('/:id/stats', async (req, res) => {
  const accountId = oid(req.params.id);
  const [account, totalStatuses, uniqueViewers, totalViews] = await Promise.all([
    BtbAccount.findById(req.params.id),
    StatusPost.countDocuments({ accountId }),
    StatusView.distinct('viewerJid', { accountId }).then(a => a.length),
    StatusView.countDocuments({ accountId }),
  ]);
  if (!account) return res.status(404).json({ error: 'חשבון לא נמצא' });

  res.json({
    totalStatuses,
    uniqueViewers,
    totalViews,
    targetFollowers: account.targetFollowers,
    targetReached: uniqueViewers >= account.targetFollowers,
    waStatus: statusManager.getStatus(req.params.id),
  });
});

// ─── רשימת סטטוסים אחרונים ───────────────────────────────────────
router.get('/:id/statuses', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const statuses = await StatusPost.find({ accountId: req.params.id })
    .sort({ postedAt: -1 })
    .limit(limit)
    .lean();
  res.json(statuses);
});

// ─── צופים של סטטוס בודד ─────────────────────────────────────────
router.get('/:id/statuses/:statusId/viewers', async (req, res) => {
  const post = await StatusPost.findOne({ _id: req.params.statusId, accountId: req.params.id });
  if (!post) return res.status(404).json({ error: 'סטטוס לא נמצא' });

  const viewers = await StatusView.find({ accountId: req.params.id, msgId: post.msgId })
    .sort({ viewedAt: -1 })
    .lean();

  res.json(viewers.map(v => {
    const { phone, name, pushName } = statusManager.resolveViewer(req.params.id, v.viewerJid);
    return { viewerJid: v.viewerJid, phone, name, pushName, viewedAt: v.viewedAt, receiptType: v.receiptType };
  }));
});

// ─── דירוג צופים (גרעין העוקבים) ─────────────────────────────────
router.get('/:id/top-viewers', async (req, res) => {
  const accountId = oid(req.params.id);
  const limit = Math.min(parseInt(req.query.limit) || 1000, 5000);

  const viewers = await StatusView.aggregate([
    { $match: { accountId } },
    { $group: {
        _id: '$viewerJid',
        statusesViewed: { $sum: 1 },          // ייחודי לכל סטטוס => זו ספירת סטטוסים שונים
        firstViewedAt: { $min: '$viewedAt' },
        lastViewedAt: { $max: '$viewedAt' },
    } },
    { $sort: { statusesViewed: -1, lastViewedAt: -1 } },
    { $limit: limit },
  ]);

  // פתרון טלפון+שם בזמן אמת ממיפויי החיבור (לא מהנתון השמור)
  res.json(viewers.map(v => {
    const { phone, name, pushName } = statusManager.resolveViewer(req.params.id, v._id);
    return {
      viewerJid: v._id, phone, name, pushName,
      statusesViewed: v.statusesViewed,
      firstViewedAt: v.firstViewedAt, lastViewedAt: v.lastViewedAt,
    };
  }));
});

export default router;
