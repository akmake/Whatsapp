import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR   = path.join(__dirname, '../logs');
const LOG_FILE  = path.join(LOG_DIR, 'app.log');
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB לפני rotation
const RING_SIZE = 2000;

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// Write stream עם flags: 'a' — ממשיך לכתוב גם לאחר קריסה וריסטרט
let _stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
let _mongoSink = null; // מוזרק לאחר חיבור MongoDB
let _fileBytes = 0;
try { _fileBytes = fs.statSync(LOG_FILE).size; } catch (e) {}

export const setMongoSink = (fn) => { _mongoSink = fn; };

const ring = [];

const rotatIfNeeded = () => {
    if (_fileBytes < MAX_FILE_BYTES) return;
    try {
        _stream.close();
        fs.renameSync(LOG_FILE, LOG_FILE.replace('.log', `.${Date.now()}.log`));
        _stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
        _fileBytes = 0;
    } catch (e) {}
};

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };
// רק warn ומעלה הולכים לדיסק — debug/info רק ב-ring buffer
const DISK_MIN_LEVEL = 2; // warn

const write = (level, component, message, extra = {}) => {
    const entry = {
        ts:        new Date().toISOString(),
        level,
        component,
        message,
        pid:       process.pid,
        mem:       Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        ...extra,
    };

    // 1. Ring buffer (in-memory) — כל הרמות
    ring.push(entry);
    if (ring.length > RING_SIZE) ring.shift();

    // 2. Disk — רק warn/error/fatal (שורד קריסות, לא מוצף ב-info)
    if ((LEVELS[level] ?? 0) >= DISK_MIN_LEVEL) {
        rotatIfNeeded();
        const line = JSON.stringify(entry) + '\n';
        _stream.write(line);
        _fileBytes += line.length;
    }

    // 3. MongoDB — async, best-effort, רק warn ומעלה
    if (_mongoSink && (LEVELS[level] ?? 0) >= DISK_MIN_LEVEL) {
        _mongoSink(entry).catch(() => {});
    }
};

export const logger = {
    debug: (component, msg, extra) => write('debug', component, msg, extra),
    info:  (component, msg, extra) => write('info',  component, msg, extra),
    warn:  (component, msg, extra) => write('warn',  component, msg, extra),
    error: (component, msg, extra) => write('error', component, msg, extra),
    fatal: (component, msg, extra) => write('fatal', component, msg, extra),
    ring:  () => [...ring].reverse(),
    logFile: () => LOG_FILE,
};

// ─── קריאת לוג לפני קריסה (מהקובץ — שורד ריסטרט) ────────────────

export const readPreCrashLog = (maxLines = 300) => {
    try {
        const content = fs.readFileSync(LOG_FILE, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);
        const tail  = lines.slice(-maxLines);
        return tail.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch (e) { return []; }
};

// מחפש את אירוע הקריסה האחרון בקובץ הלוג
export const findLastCrash = () => {
    const entries = readPreCrashLog(500);
    // מחפשים fatal/crash מ-pid אחר (= ריצה קודמת)
    const thisPid = process.pid;
    const crash   = [...entries].reverse().find(e =>
        (e.level === 'fatal' || e.component === 'crash') && e.pid !== thisPid
    );
    return crash || null;
};
