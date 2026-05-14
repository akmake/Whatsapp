import express from 'express';
import Tenant from '../models/Tenant.js';
import { getQR, getAllStatuses, isConnected, sendMessage } from '../services/whatsappManager.js';
import { startBridge, stopBridge, getBridgeStats, testImapConnection } from '../services/emailBridgeManager.js';
import { poolAdd, poolRemove, poolUpdateTenant, poolForceWake, getPoolStatus } from '../services/tenantPool.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { invalidateTransporter } from '../services/emailRenderer.js';

const router = express.Router();

// כל הלקוחות + סטטוס
router.get('/', async (req, res) => {
    const tenants = await Tenant.find().select('-bridgeEmailPassword');
    const waStatuses = getAllStatuses();

    const result = tenants.map(t => ({
        _id: t._id,
        name: t.name,
        phone: t.phone,
        bridgeEmail: t.bridgeEmail,
        destinationEmail: t.destinationEmail,
        active: t.active,
        waStatus: waStatuses[t._id.toString()] || 'disconnected',
        bridge: getBridgeStats(t._id.toString()),
        createdAt: t.createdAt,
    }));

    res.json(result);
});

// מצב ה-pool
router.get('/pool-status', (req, res) => {
    res.json(getPoolStatus());
});

// יצירת לקוח
router.post('/', async (req, res) => {
    const { name, phone } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'שם ומספר טלפון הם חובה' });

    const tenant = await Tenant.create({ name, phone });
    poolAdd(tenant._id.toString(), tenant);

    res.status(201).json({ _id: tenant._id, name, phone, waStatus: 'sleeping' });
});

// עדכון שם וטלפון
router.put('/:id/info', async (req, res) => {
    const { name, phone } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'שם ומספר טלפון הם חובה' });

    const tenant = await Tenant.findByIdAndUpdate(req.params.id, { name, phone }, { new: true });
    if (!tenant) return res.status(404).json({ error: 'לקוח לא נמצא' });

    poolUpdateTenant(req.params.id, tenant);
    res.json({ ok: true, name: tenant.name, phone: tenant.phone });
});

// עדכון הגדרות מייל
router.put('/:id/email-config', async (req, res) => {
    const { bridgeEmail, bridgeEmailPassword, destinationEmail } = req.body;
    if (!bridgeEmail || !destinationEmail)
        return res.status(400).json({ error: 'כתובות המייל הן חובה' });

    const update = { bridgeEmail, destinationEmail };
    if (bridgeEmailPassword) update.bridgeEmailPassword = encrypt(bridgeEmailPassword);

    const tenant = await Tenant.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!tenant) return res.status(404).json({ error: 'לקוח לא נמצא' });

    const tenantId = tenant._id.toString();
    poolUpdateTenant(tenantId, tenant);
    invalidateTransporter(tenantId);

    // Use plaintext password from request body (before encryption) for testing
    const plaintextPassword = bridgeEmailPassword || decrypt(tenant.bridgeEmailPassword);
    stopBridge(tenantId);
    const test = await testImapConnection(tenant.bridgeEmail, plaintextPassword);
    if (test.ok) await startBridge(tenantId, tenant);

    res.json({
        ok: true,
        imapOk: test.ok,
        imapError: test.ok ? null : test.error,
        bridgeEmail: tenant.bridgeEmail,
        destinationEmail: tenant.destinationEmail,
    });
});

// שליחת הודעה ידנית
router.post('/:id/send', async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'טלפון והודעה הם חובה' });

    const tenantId = req.params.id;
    if (!isConnected(tenantId)) return res.status(400).json({ error: 'הוואצאפ של לקוח זה לא מחובר כרגע' });

    const jid = `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
    await sendMessage(tenantId, jid, { text: message });
    res.json({ ok: true });
});

// QR לסריקה — מעיר את הלקוח ומחכה עד שה-QR מוכן (long poll עד 30ש׳)
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

// מחיקת לקוח
router.delete('/:id', async (req, res) => {
    poolRemove(req.params.id);
    await Tenant.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
});

// חיבור מחדש
router.post('/:id/reconnect', async (req, res) => {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'לקוח לא נמצא' });
    poolForceWake(req.params.id);
    res.json({ ok: true });
});

export default router;
