import express from 'express';
import AuditLog from '../models/AuditLog.js';

const router = express.Router();

router.get('/', async (req, res) => {
    const { tenantId, action, limit = 100 } = req.query;
    const filter = {};
    if (tenantId) filter.tenantId = tenantId;
    if (action)   filter.action   = action;

    const logs = await AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(Math.min(parseInt(limit) || 100, 500));

    res.json(logs);
});

export default router;
