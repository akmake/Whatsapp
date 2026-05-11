import express from 'express';
import Tenant from '../models/Tenant.js';
import { getAllStats } from '../services/whatsappManager.js';
import { getBridgeStats } from '../services/emailBridgeManager.js';

const router = express.Router();

router.get('/', async (req, res) => {
    const tenants = await Tenant.find().select('-bridgeEmailPassword');
    const waStats = getAllStats();

    const data = tenants.map(t => {
        const id = t._id.toString();
        const wa = waStats[id] || { status: 'disconnected', msgsReceived: 0, msgsSent: 0, reconnectCount: 0, connectedAt: null, lastMsgAt: null, lastMsgDirection: null };
        const bridge = getBridgeStats(id);

        return {
            _id: id,
            name: t.name,
            phone: t.phone,
            bridgeEmail: t.bridgeEmail || null,
            destinationEmail: t.destinationEmail || null,
            emailConfigured: !!(t.bridgeEmail && t.bridgeEmailPassword && t.destinationEmail),
            wa: {
                status: wa.status,
                connectedAt: wa.connectedAt,
                lastMsgAt: wa.lastMsgAt,
                lastMsgDirection: wa.lastMsgDirection,
                msgsReceived: wa.msgsReceived,
                msgsSent: wa.msgsSent,
                reconnectCount: wa.reconnectCount,
            },
            bridge: {
                active: bridge.active || false,
                waToEmail: bridge.waToEmail || 0,
                emailToWa: bridge.emailToWa || 0,
                lastEmailAt: bridge.lastEmailAt || null,
                connectedAt: bridge.connectedAt || null,
                reconnectCount: bridge.reconnectCount || 0,
            },
        };
    });

    const summary = {
        total: data.length,
        connected: data.filter(t => t.wa.status === 'connected').length,
        disconnected: data.filter(t => t.wa.status === 'disconnected').length,
        waitingQr: data.filter(t => t.wa.status === 'waiting_qr').length,
        emailNotConfigured: data.filter(t => !t.emailConfigured).length,
        totalWaToEmail: data.reduce((s, t) => s + t.bridge.waToEmail, 0),
        totalEmailToWa: data.reduce((s, t) => s + t.bridge.emailToWa, 0),
    };

    res.json({ summary, tenants: data });
});

export default router;
