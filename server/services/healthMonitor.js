import { logger } from '../utils/logger.js';

const TICK_MS        = 5_000;   // בדיקה כל 5 שניות
const LAG_WARN_MS    = 500;     // lag > 500ms → warn
const LAG_ERROR_MS   = 2_000;   // lag > 2s   → error (שרת כבד)
const MEM_WARN_MB    = 600;     // heap > 600MB → warn
const MEM_ERROR_MB   = 900;     // heap > 900MB → error
const LEAK_WINDOW    = 12;      // 12 דגימות × 5ש׳ = דקה אחת
const LEAK_GROWTH_MB = 80;      // גדל > 80MB בדקה → חשד ל-leak

const memSamples = [];          // ring buffer של heapUsed (MB)
let expected = Date.now() + TICK_MS;
let monitorInterval = null;

// ─── snapshot בריאות ─────────────────────────────────────────────

export const getHealthSnapshot = () => {
    const mem = process.memoryUsage();
    return {
        uptime:     Math.round(process.uptime()),
        pid:        process.pid,
        heapUsed:   Math.round(mem.heapUsed   / 1024 / 1024),
        heapTotal:  Math.round(mem.heapTotal  / 1024 / 1024),
        rss:        Math.round(mem.rss        / 1024 / 1024),
        external:   Math.round(mem.external   / 1024 / 1024),
        memSamples: [...memSamples],
    };
};

// ─── הפעלה ───────────────────────────────────────────────────────

export const startHealthMonitor = () => {
    if (monitorInterval) return;

    expected = Date.now() + TICK_MS;

    monitorInterval = setInterval(() => {
        const now = Date.now();
        const lag = now - expected;
        expected  = now + TICK_MS;

        const mem     = process.memoryUsage();
        const heapMB  = Math.round(mem.heapUsed / 1024 / 1024);
        const rssMB   = Math.round(mem.rss      / 1024 / 1024);

        // ── event loop lag ──
        if (lag > LAG_ERROR_MS) {
            logger.error('health', `event loop lag ${lag}ms — השרת עומס`, { lag, heapMB, rssMB });
        } else if (lag > LAG_WARN_MS) {
            logger.warn('health', `event loop lag ${lag}ms`, { lag, heapMB });
        }

        // ── memory ──
        if (heapMB > MEM_ERROR_MB) {
            logger.error('health', `heap גבוה ${heapMB}MB`, { heapMB, rssMB });
        } else if (heapMB > MEM_WARN_MB) {
            logger.warn('health', `heap ${heapMB}MB`, { heapMB });
        }

        // ── leak detection ──
        memSamples.push(heapMB);
        if (memSamples.length > LEAK_WINDOW) memSamples.shift();
        if (memSamples.length === LEAK_WINDOW) {
            const growth = memSamples[LEAK_WINDOW - 1] - memSamples[0];
            if (growth > LEAK_GROWTH_MB) {
                logger.error('health', `חשד ל-memory leak: גדל ${growth}MB בדקה האחרונה`, {
                    start: memSamples[0], end: memSamples[LEAK_WINDOW - 1], growth,
                });
            }
        }
    }, TICK_MS);

    // unref כדי שלא ימנע סגירת process נקייה
    monitorInterval.unref();

    logger.info('health', 'health monitor started', { tickMs: TICK_MS });
};
