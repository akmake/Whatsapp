import express from 'express';
import Tenant from '../models/Tenant.js';
import { startTenant, stopTenant, getStatus, getQR, getAllStatuses, isConnected, sendMessage } from '../services/whatsappManager.js';
import { startBridge, stopBridge, getBridgeStats, testImapConnection } from '../services/emailBridgeManager.js';
import { handleIncomingWAMessage } from '../services/bridgeHandler.js';

const router = express.Router();

// קבלת כל הלקוחות + סטטוס
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

// יצירת לקוח — שם וטלפון בלבד
router.post('/', async (req, res) => {
    const { name, phone } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'שם ומספר טלפון הם חובה' });

    const tenant = await Tenant.create({ name, phone });
    const tenantId = tenant._id.toString();

    await startTenant(tenantId, handleIncomingWAMessage);

    res.status(201).json({ _id: tenant._id, name, phone, waStatus: 'connecting' });
});

// עדכון הגדרות מייל של לקוח
router.put('/:id/email-config', async (req, res) => {
    const { bridgeEmail, bridgeEmailPassword, destinationEmail } = req.body;
    if (!bridgeEmail || !bridgeEmailPassword || !destinationEmail) {
        return res.status(400).json({ error: 'כל שדות המייל הם חובה' });
    }

    // בדיקת חיבור IMAP לפני שמירה
    const test = await testImapConnection(bridgeEmail, bridgeEmailPassword);
    if (!test.ok) {
        return res.status(400).json({ error: test.error });
    }

    const tenant = await Tenant.findByIdAndUpdate(
        req.params.id,
        { bridgeEmail, bridgeEmailPassword, destinationEmail },
        { new: true }
    );
    if (!tenant) return res.status(404).json({ error: 'לקוח לא נמצא' });

    const tenantId = tenant._id.toString();
    stopBridge(tenantId);
    await startBridge(tenantId, tenant);

    res.json({ ok: true, bridgeEmail: tenant.bridgeEmail, destinationEmail: tenant.destinationEmail });
});

// שליחת הודעה חדשה לכל מספר וואצאפ
router.post('/:id/send', async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'טלפון והודעה הם חובה' });

    const tenantId = req.params.id;
    if (!isConnected(tenantId)) return res.status(400).json({ error: 'הוואצאפ של לקוח זה לא מחובר' });

    const jid = `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
    await sendMessage(tenantId, jid, { text: message });

    res.json({ ok: true });
});

// קבלת QR לסריקה
router.get('/:id/qr', (req, res) => {
    const qr = getQR(req.params.id);
    if (!qr) return res.status(404).json({ error: 'QR לא זמין' });
    res.json({ qr });
});

// מחיקת לקוח
router.delete('/:id', async (req, res) => {
    const tenantId = req.params.id;
    stopTenant(tenantId);
    stopBridge(tenantId);
    await Tenant.findByIdAndDelete(tenantId);
    res.json({ ok: true });
});

// חיבור מחדש
router.post('/:id/reconnect', async (req, res) => {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'לקוח לא נמצא' });

    const tenantId = tenant._id.toString();
    stopTenant(tenantId);
    stopBridge(tenantId);
    await startTenant(tenantId, handleIncomingWAMessage);
    if (tenant.bridgeEmail && tenant.bridgeEmailPassword && tenant.destinationEmail) {
        await startBridge(tenantId, tenant);
    }

    res.json({ ok: true });
});

export default router;
