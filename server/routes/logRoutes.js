import express from 'express';
import fs from 'fs';
import { protect } from '../middlewares/authMiddleware.js';
import { logger, readPreCrashLog, findLastCrash } from '../utils/logger.js';
import { getHealthSnapshot } from '../services/healthMonitor.js';
import LogEntry from '../models/LogEntry.js';

const r = express.Router();

// GET /api/logs — ring buffer (real-time, in-memory)
r.get('/', protect, async (req, res) => {
    try {
        const { level, component, tenantId, limit = '500', source = 'ring' } = req.query;
        const lim = Math.min(parseInt(limit) || 500, 2000);

        if (source === 'db') {
            const q = {};
            if (level)     q.level     = level;
            if (component) q.component = component;
            if (tenantId)  q.tenantId  = tenantId;
            const entries = await LogEntry.find(q).sort({ ts: -1 }).limit(lim).lean();
            return res.json(entries);
        }

        // ring buffer
        let entries = logger.ring();
        if (level)     entries = entries.filter(e => e.level === level);
        if (component) entries = entries.filter(e => e.component === component);
        if (tenantId)  entries = entries.filter(e => e.tenantId === tenantId);
        res.json(entries.slice(0, lim));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/logs/crash — דוח קריסה אחרון
r.get('/crash', protect, (req, res) => {
    const crash = findLastCrash();
    if (!crash) return res.json({ found: false });

    // מחזיר את הקריסה + 50 הרשומות שקדמו לה מהקובץ
    const all = readPreCrashLog(500);
    const crashIdx = all.findIndex(e => e.ts === crash.ts && e.pid === crash.pid);
    const context  = crashIdx >= 0 ? all.slice(Math.max(0, crashIdx - 50), crashIdx + 1) : [crash];
    res.json({ found: true, crash, context });
});

// GET /api/logs/file — הורדת קובץ הלוג הגולמי
r.get('/file', protect, (req, res) => {
    const filePath = logger.logFile();
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'אין קובץ לוג' });
    res.download(filePath, 'app.log');
});

// GET /api/logs/stats — סטטיסטיקות + health snapshot
r.get('/stats', protect, (req, res) => {
    const entries = logger.ring();
    const counts = { warn: 0, error: 0, fatal: 0 };
    entries.forEach(e => { if (counts[e.level] !== undefined) counts[e.level]++; });
    const lastError = [...entries].find(e => e.level === 'error' || e.level === 'fatal');
    res.json({
        counts,
        lastError,
        health: getHealthSnapshot(),
    });
});

export default r;
