import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import BtbAccount from '../models/BtbAccount.js';
import StatusPost from '../models/StatusPost.js';
import StatusView from '../models/StatusView.js';
import * as statusManager from '../services/statusManager.js';
import { audit } from '../utils/audit.js';

const router = express.Router();

const oid = (id) => new mongoose.Types.ObjectId(id);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024 } });

// ─── מספר נמענים (אנשי קשר) שיראו סטטוס ──────────────────────────
router.get('/:id/audience', (req, res) => {
  res.json({ count: statusManager.getAudienceSize(req.params.id) });
});

// ─── העלאת סטטוס (תמונה/ווידאו/טקסט) ─────────────────────────────
router.post('/:id/status', upload.single('file'), async (req, res) => {
  const { type, caption = '', bgColor = '', font } = req.body;
  const buffer = req.file?.buffer;
  if ((type === 'image' || type === 'video') && !buffer) return res.status(400).json({ error: 'חסר קובץ' });
  if (type === 'text' && !caption) return res.status(400).json({ error: 'חסר טקסט' });
  try {
    const result = await statusManager.postStatus(req.params.id, {
      type, buffer, caption, bgColor,
      font: font ? parseInt(font) : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── בדיקת איכות: עבודת-רקע (POST מפעיל ומחזיר testId; GET סוקר תוצאה) ──
// הבקשה לא מחזיקה את החיבור פתוח לכל המסע => אין ERR_CONNECTION_RESET.
router.post('/:id/status-test', upload.single('file'), (req, res) => {
  const buffer = req.file?.buffer;
  if (!buffer) return res.status(400).json({ error: 'חסר קובץ' });
  const type = req.body.type || (req.file.mimetype?.startsWith('video') ? 'video' : 'image');
  try {
    const testId = statusManager.startQualityTest(req.params.id, { type, buffer });
    res.json({ testId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/status-test/:testId', (req, res) => {
  res.json(statusManager.getQualityTest(req.params.testId));
});

// ─── כל חשבונות BTB + סטטוס חיבור ─────────────────────────────────
router.get('/', async (req, res) => {
  const accounts = await BtbAccount.find().sort({ createdAt: -1 });
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
  }));
  res.json(result);
});

// ─── יצירת חשבון ─────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'שם ומספר טלפון הם חובה' });

  const account = await BtbAccount.create({ name, phone });
  await statusManager.connect(account._id.toString());
  await audit(req, 'btb.create', account._id.toString(), { name, phone });

  res.status(201).json({ _id: account._id, name, phone, waStatus: 'connecting' });
});

// ─── עדכון חשבון ─────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
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

// ─── QR לחיבור ───────────────────────────────────────────────────
router.get('/:id/qr', async (req, res) => {
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

router.post('/:id/reconnect', async (req, res) => {
  await statusManager.connect(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/reset-session', async (req, res) => {
  statusManager.reset(req.params.id);
  await statusManager.connect(req.params.id);
  res.json({ ok: true });
});

// ─── מחיקת חשבון (כולל נתוני סטטוסים/צפיות) ──────────────────────
router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  await audit(req, 'btb.delete', id);
  statusManager.reset(id);
  await Promise.all([
    BtbAccount.findByIdAndDelete(id),
    StatusPost.deleteMany({ accountId: id }),
    StatusView.deleteMany({ accountId: id }),
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
