import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MEDIA_DIR  = path.join(path.dirname(fileURLToPath(import.meta.url)), '../media');
const MAX_AGE_MS = 26 * 60 * 60 * 1000; // 26 שעות — שרשור יומי בלבד

const run = () => {
    if (!fs.existsSync(MEDIA_DIR)) return;
    const cutoff = Date.now() - MAX_AGE_MS;
    let deleted = 0;
    try {
        for (const tenantDir of fs.readdirSync(MEDIA_DIR)) {
            const tenantPath = path.join(MEDIA_DIR, tenantDir);
            if (!fs.statSync(tenantPath).isDirectory()) continue;
            for (const file of fs.readdirSync(tenantPath)) {
                const filePath = path.join(tenantPath, file);
                try {
                    if (fs.statSync(filePath).mtimeMs < cutoff) {
                        fs.unlinkSync(filePath);
                        deleted++;
                    }
                } catch (e) {}
            }
        }
        if (deleted > 0) console.log(`[media-cleanup] נמחקו ${deleted} קבצים ישנים`);
    } catch (e) {
        console.error('[media-cleanup] שגיאה:', e.message);
    }
};

export const startMediaCleanup = () => {
    run();
    setInterval(run, 24 * 60 * 60 * 1000);
    console.log('[media-cleanup] פעיל — מנקה קבצי מדיה מעל 30 יום');
};
