import express from 'express';
import Tenant from '../models/Tenant.js';
import { startTenant, stopTenant, getStatus, getQR, getAllStatuses } from '../services/whatsappManager.js';
import { startBridge, stopBridge, getBridgeStats } from '../services/emailBridgeManager.js';
import { handleIncomingWAMessage } from '../services/bridgeHandler.js';

const router = express.Router();

// קבלת כל הלקוחות + סטטוס
router.get('/', async (req, res) => {
    const tenants = await Tenant.find().select('-emailPassword');
    const waStatuses = getAllStatuses();

    const result = tenants.map(t => ({
        _id: t._id,
        name: t.name,
        phone: t.phone,
        email: t.email,
        active: t.active,
        waStatus: waStatuses[t._id.toString()] || 'disconnected',
        bridge: getBridgeStats(t._id.toString()),
        createdAt: t.createdAt,
    }));

    res.json(result);
});

// הוספת לקוח חדש
router.post('/', async (req, res) => {
    const { name, phone, email, emailPassword, emailHost } = req.body;
    if (!name || !phone || !email || !emailPassword) {
        return res.status(400).json({ error: 'שם, טלפון, מייל וסיסמת מייל הם שדות חובה' });
    }

    const tenant = await Tenant.create({ name, phone, email, emailPassword, emailHost });
    const tenantId = tenant._id.toString();

    await startTenant(tenantId, handleIncomingWAMessage);
    await startBridge(tenantId, tenant);

    res.status(201).json({ _id: tenant._id, name, phone, email, waStatus: 'connecting' });
});

// מחיקת לקוח
router.delete('/:id', async (req, res) => {
    const tenantId = req.params.id;
    stopTenant(tenantId);
    stopBridge(tenantId);
    await Tenant.findByIdAndDelete(tenantId);
    res.json({ ok: true });
});

// קבלת QR לסריקה
router.get('/:id/qr', (req, res) => {
    const qr = getQR(req.params.id);
    if (!qr) return res.status(404).json({ error: 'QR לא זמין — אולי כבר מחובר?' });
    res.json({ qr });
});

// סטטוס לקוח ספציפי
router.get('/:id/status', (req, res) => {
    res.json({ status: getStatus(req.params.id), bridge: getBridgeStats(req.params.id) });
});

// ניתוק ידני
router.post('/:id/disconnect', (req, res) => {
    stopTenant(req.params.id);
    stopBridge(req.params.id);
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
    await startBridge(tenantId, tenant);

    res.json({ ok: true });
});

export default router;
