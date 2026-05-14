import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MEDIA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../media');

const r = express.Router();

// GET /api/media/:tenantId/:filename — ציבורי, לטעינת תמונות בתוך אימיילים
r.get('/:tenantId/:filename', (req, res) => {
    const { tenantId, filename } = req.params;

    // מניעת path traversal
    if (filename.includes('..') || filename.includes('/') || tenantId.includes('..')) {
        return res.status(400).end();
    }

    const filePath = path.join(MEDIA_DIR, tenantId, filename);
    if (!fs.existsSync(filePath)) return res.status(404).end();

    const ext = path.extname(filename).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
               : ext === '.png'  ? 'image/png'
               : ext === '.webp' ? 'image/webp'
               : ext === '.gif'  ? 'image/gif'
               : ext === '.mp4'  ? 'video/mp4'
               : ext === '.webm' ? 'video/webm'
               : ext === '.ogg'  ? 'audio/ogg'
               : ext === '.mp3'  ? 'audio/mpeg'
               : ext === '.m4a'  ? 'audio/mp4'
               : ext === '.pdf'  ? 'application/pdf'
               : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
               : ext === '.doc'  ? 'application/msword'
               : ext === '.xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
               : ext === '.xls'  ? 'application/vnd.ms-excel'
               : 'application/octet-stream';

    const isInline = mime.startsWith('image/') || mime.startsWith('video/') || mime === 'application/pdf';
    res.setHeader('Content-Disposition', isInline ? 'inline' : `attachment; filename="${filename}"`);

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
});

export default r;
