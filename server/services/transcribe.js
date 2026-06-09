// לקוח דק ל-transcribeWorker: שולח עבודות תמלול ל-worker thread ייעודי
// ומחזיר Promise לכל עבודה. ה-inference הכבד רץ מחוץ ל-event loop הראשי,
// כך שתמלול הקלטה אחת לא חוסם עיבוד הודעות נכנסות אחרות.
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const WORKER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'transcribeWorker.js');

let _worker = null;
let _seq = 0;
const pending = new Map(); // id → { resolve }

const rejectAll = (reason) => {
    for (const [, { resolve }] of pending) resolve(null); // נכשל בעדינות — מחזיר null
    pending.clear();
};

const getWorker = () => {
    if (_worker) return _worker;

    console.log('[Whisper] מפעיל worker thread לתמלול...');
    _worker = new Worker(WORKER_PATH);

    _worker.on('message', ({ id, text, error }) => {
        const entry = pending.get(id);
        if (!entry) return;
        pending.delete(id);
        if (error) {
            console.error('[Whisper] transcription failed:', error);
            entry.resolve(null);
        } else {
            entry.resolve(text);
        }
    });

    _worker.on('error', (err) => {
        console.error('[Whisper] worker error:', err.message);
        rejectAll(err);
        _worker = null; // ייווצר מחדש בעבודה הבאה
    });

    _worker.on('exit', (code) => {
        if (code !== 0) console.error(`[Whisper] worker יצא עם קוד ${code}`);
        rejectAll(new Error(`worker exit ${code}`));
        _worker = null;
    });

    return _worker;
};

export const transcribeAudio = (filePath) =>
    new Promise((resolve) => {
        const id = ++_seq;
        pending.set(id, { resolve });
        try {
            getWorker().postMessage({ id, filePath });
        } catch (err) {
            pending.delete(id);
            console.error('[Whisper] לא ניתן לשלוח עבודה ל-worker:', err.message);
            resolve(null);
        }
    });
