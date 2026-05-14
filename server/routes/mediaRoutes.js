import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const MEDIA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../media');

const r = express.Router();

// GET /api/media/:tenantId/:filename
// ציבורי — נדרש לטעינת מדיה בתוך אימיילים ללא אימות
r.get('/:tenantId/:filename', (req, res) => {
    const { tenantId, filename } = req.params;

    if (filename.includes('..') || filename.includes('/') || tenantId.includes('..')) {
        return res.status(400).end();
    }

    const filePath = path.join(MEDIA_DIR, tenantId, filename);
    if (!fs.existsSync(filePath)) return res.status(404).end();

    // sendFile מטפל אוטומטית ב-Range requests (נדרש לניגון וידאו/שמע),
    // כותרות Cache-Control, ו-Content-Type לפי הסיומת
    res.sendFile(filePath, {
        headers: { 'Cache-Control': 'public, max-age=86400' },
    });
});

export default r;
