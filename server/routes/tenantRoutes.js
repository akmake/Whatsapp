import express from 'express';
import rateLimit from 'express-rate-limit';
import Tenant from '../models/Tenant.js';
import Message from '../models/Message.js';
import { getQR, getAllStatuses, isConnected, sendMessage, fetchGroups, resetSession } from '../services/whatsappManager.js';
import { startBridge, stopBridge, getBridgeStats, testImapConnection } from '../services/emailBridgeManager.js';
import { poolAdd, poolRemove, poolUpdateTenant, poolForceWake, getPoolStatus } from '../services/tenantPool.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { invalidateTransporter } from '../services/emailRenderer.js';
import { audit } from '../utils/audit.js';
import { exportConversation } from '../services/aiAnalysis.js';

const router = express.Router();

const credentialLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 15,
    message: { error: 'יותר מדי בקשות לחשיפת פרטי גישה — נסה שוב בעוד שעה' },
});

// ─── כל הלקוחות + סטטוס ──────────────────────────────────────────
router.get('/', async (req, res) => {
    const tenants = await Tenant.find().select('-bridgeEmailPassword');
    const waStatuses = getAllStatuses();

    const result = tenants.map(t => ({
        _id:             t._id,
        name:            t.name,
        phone:           t.phone,
        bridgeEmail:     t.bridgeEmail,
        destinationEmail:t.destinationEmail,
        active:          t.active,
        waStatus:        waStatuses[t._id.toString()] || 'disconnected',
        bridge:          getBridgeStats(t._id.toString()),
        createdAt:       t.createdAt,
        // billing
        planType:        t.planType,
        planPrice:       t.planPrice,
        billingStatus:   t.billingStatus,
        nextBillingDate: t.nextBillingDate,
        // contact
        contractEmail:   t.contractEmail,
        tags:            t.tags,
        internalNotes:   t.internalNotes,
        // groups
        groupsEnabled:   t.groupsEnabled,
        allowedGroups:   t.allowedGroups,
    }));

    res.json(result);
});

// ─── מצב ה-pool ───────────────────────────────────────────────────
router.get('/pool-status', (req, res) => {
    res.json(getPoolStatus());
});

// ─── יצירת לקוח ──────────────────────────────────────────────────
router.post('/', async (req, res) => {
    const { name, phone } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'שם ומספר טלפון הם חובה' });

    const tenant = await Tenant.create({ name, phone });
    poolAdd(tenant._id.toString(), tenant);
    await audit(req, 'tenant.create', tenant._id.toString(), { name, phone });

    res.status(201).json({ _id: tenant._id, name, phone, waStatus: 'sleeping' });
});

// ─── עדכון שם וטלפון ──────────────────────────────────────────────
router.put('/:id/info', async (req, res) => {
    const { name, phone } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'שם ומספר טלפון הם חובה' });

    const tenant = await Tenant.findByIdAndUpdate(req.params.id, { name, phone }, { new: true });
    if (!tenant) return res.status(404).json({ error: 'לקוח לא נמצא' });

    poolUpdateTenant(req.params.id, tenant);
    await audit(req, 'tenant.update.info', req.params.id, { name, phone });
    res.json({ ok: true, name: tenant.name, phone: tenant.phone });
});

// ─── עדכון תוכנית וחיוב ───────────────────────────────────────────
router.put('/:id/plan', async (req, res) => {
    const { planType, planPrice, billingStatus, nextBillingDate, contractEmail, tags, internalNotes } = req.body;

    const update = {};
    if (planType        !== undefined) update.planType        = planType;
    if (planPrice       !== undefined) update.planPrice       = parseFloat(planPrice) || 0;
    if (billingStatus   !== undefined) update.billingStatus   = billingStatus;
    if (nextBillingDate !== undefined) update.nextBillingDate = nextBillingDate ? new Date(nextBillingDate) : null;
    if (contractEmail   !== undefined) update.contractEmail   = contractEmail;
    if (tags            !== undefined) update.tags            = tags;
    if (internalNotes   !== undefined) update.internalNotes   = internalNotes;

    const tenant = await Tenant.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!tenant) return res.status(404).json({ error: 'לקוח לא נמצא' });

    poolUpdateTenant(req.params.id, tenant);
    await audit(req, 'tenant.update.plan', req.params.id, { planType, billingStatus });
    res.json({ ok: true });
});

// ─── עדכון הגדרות מייל ────────────────────────────────────────────
router.put('/:id/email-config', async (req, res) => {
    const { bridgeEmail, bridgeEmailPassword, destinationEmail, emailSignature } = req.body;
    if (!bridgeEmail || !destinationEmail)
        return res.status(400).json({ error: 'כתובות המייל הן חובה' });

    const update = { bridgeEmail, destinationEmail, emailSignature: emailSignature || '' };
    if (bridgeEmailPassword) update.bridgeEmailPassword = encrypt(bridgeEmailPassword);

    const tenant = await Tenant.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!tenant) return res.status(404).json({ error: 'לקוח לא נמצא' });

    const tenantId = tenant._id.toString();
    poolUpdateTenant(tenantId, tenant);
    invalidateTransporter(tenantId);

    const plaintextPassword = bridgeEmailPassword || decrypt(tenant.bridgeEmailPassword);
    stopBridge(tenantId);
    const test = await testImapConnection(tenant.bridgeEmail, plaintextPassword);
    if (test.ok) await startBridge(tenantId, tenant);

    await audit(req, 'tenant.update.email', tenantId, { bridgeEmail });
    res.json({
        ok: true,
        imapOk:    test.ok,
        imapError: test.ok ? null : test.error,
        bridgeEmail:      tenant.bridgeEmail,
        destinationEmail: tenant.destinationEmail,
    });
});

// ─── חשיפת פרטי גישה (audit logged + rate limited) ───────────────
router.post('/:id/reveal-credentials', credentialLimiter, async (req, res) => {
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'יש לספק סיבה לחשיפת הסיסמה' });

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'לקוח לא נמצא' });
    if (!tenant.bridgeEmailPassword) return res.status(404).json({ error: 'לא הוגדרה סיסמה ללקוח זה' });

    await audit(req, 'credential.reveal', req.params.id, {
        reason:     reason.trim(),
        bridgeEmail: tenant.bridgeEmail,
    });

    res.json({
        bridgeEmail:         tenant.bridgeEmail,
        bridgeEmailPassword: decrypt(tenant.bridgeEmailPassword),
    });
});

// ─── שליחת הודעה ידנית ────────────────────────────────────────────
router.post('/:id/send', async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'טלפון והודעה הם חובה' });

    const tenantId = req.params.id;
    if (!isConnected(tenantId)) return res.status(400).json({ error: 'הוואצאפ של לקוח זה לא מחובר כרגע' });

    const jid = `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
    await sendMessage(tenantId, jid, { text: message });
    res.json({ ok: true });
});

// ─── QR לסריקה — long poll עד 30ש׳ ──────────────────────────────
router.get('/:id/qr', async (req, res) => {
    const tenantId = req.params.id;
    poolForceWake(tenantId);
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        const qr = getQR(tenantId);
        if (qr) return res.json({ qr });
        await new Promise(r => setTimeout(r, 500));
    }
    res.status(408).json({ error: 'לא התקבל QR תוך 30 שניות — נסה שוב' });
});

// ─── מחיקת לקוח ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    await audit(req, 'tenant.delete', req.params.id);
    poolRemove(req.params.id);
    await Tenant.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
});

// ─── ייצוא שיחה ל-JSON ───────────────────────────────────────────
router.get('/:id/export-conversation', async (req, res) => {
    const { type, groupId, phone, dateFrom, dateTo } = req.query;
    if (type === 'group' && !groupId) return res.status(400).json({ error: 'נדרש groupId' });
    if (type === 'dm'    && !phone)   return res.status(400).json({ error: 'נדרש phone' });

    try {
        const data = await exportConversation({ tenantId: req.params.id, type, groupId, phone, dateFrom, dateTo });
        const filename = `conversation_${data.meta.source}_${new Date().toISOString().slice(0,10)}.json`;
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.send(JSON.stringify(data, null, 2));
    } catch (e) {
        const status = e.message.includes('לא נמצאו') ? 404 : 500;
        res.status(status).json({ error: e.message });
    }
});

// ─── שליפת כל הקבוצות מ-WhatsApp ────────────────────────────────
router.get('/:id/wa-groups', async (req, res) => {
    const tenantId = req.params.id;
    if (!isConnected(tenantId))
        return res.status(400).json({ error: 'הוואצאפ של לקוח זה לא מחובר כרגע' });
    try {
        const groups = await fetchGroups(tenantId);
        const tenant = await Tenant.findById(tenantId).select('groupsEnabled allowedGroups');
        res.json({ groups, groupsEnabled: tenant.groupsEnabled, allowedGroups: tenant.allowedGroups });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── עדכון הגדרות קבוצות ─────────────────────────────────────────
router.put('/:id/groups', async (req, res) => {
    const { groupsEnabled, allowedGroups } = req.body;
    const update = {};
    if (groupsEnabled  !== undefined) update.groupsEnabled  = groupsEnabled;
    if (allowedGroups  !== undefined) update.allowedGroups  = allowedGroups;

    const tenant = await Tenant.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!tenant) return res.status(404).json({ error: 'לקוח לא נמצא' });

    poolUpdateTenant(req.params.id, tenant);
    await audit(req, 'tenant.update.groups', req.params.id, { groupsEnabled, count: allowedGroups?.length });
    res.json({ ok: true });
});

// ─── שליפת הודעות קבוצה ──────────────────────────────────────────
router.get('/:id/messages', async (req, res) => {
    const { groupJid, limit = 100 } = req.query;
    if (!groupJid) return res.status(400).json({ error: 'נדרש groupJid' });
    try {
        const messages = await Message.find({ tenantId: req.params.id, groupJid })
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .lean();
        res.json(messages.reverse());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── חיבור מחדש ───────────────────────────────────────────────────
router.post('/:id/reconnect', async (req, res) => {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'לקוח לא נמצא' });
    poolForceWake(req.params.id);
    res.json({ ok: true });
});

// ─── איפוס session (מחיקת session + QR חדש לחיבור מחדש) ──────────
router.post('/:id/reset-session', async (req, res) => {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'לקוח לא נמצא' });
    resetSession(req.params.id);
    await audit(req, 'tenant.reset.session', req.params.id);
    poolForceWake(req.params.id);
    res.json({ ok: true });
});

export default router;
