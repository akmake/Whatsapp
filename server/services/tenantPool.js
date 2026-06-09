import { startTenant, sleepTenant, waitForConnected } from './whatsappManager.js';
import { startBridge, stopBridge } from './emailBridgeManager.js';
import { handleIncomingWAMessage } from './bridgeHandler.js';
import { logger } from '../utils/logger.js';

const MAX_ACTIVE  = parseInt(process.env.POOL_MAX_ACTIVE     ?? '20');
const SYNC_WINDOW = parseInt(process.env.POOL_SYNC_WINDOW_MS ?? '15000');

// tenantId → { tenant, state: 'sleeping'|'waking'|'active', pendingSends: Function[] }
const pool = new Map();

// tenantIds שצריכים להתעורר מיידית (תשובת מייל ממתינה)
const prioritySet = new Set();

let conveyorPos  = 0;
let loopRunning  = false;

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ─── helpers ─────────────────────────────────────────────────────

const activeCount = () =>
    [...pool.values()].filter(e => e.state !== 'sleeping').length;

const flushPending = async (tenantId) => {
    const entry = pool.get(tenantId);
    if (!entry) return;
    while (entry.pendingSends.length) {
        const fn = entry.pendingSends.shift();
        try { await fn(); } catch (e) {
            console.error(`[pool] שגיאת שליחה ${tenantId}:`, e.message);
        }
    }
};

// ─── מחזור חיי לקוח: עלייה → sync → שינה ───────────────────────

const runCycle = async (tenantId) => {
    const entry = pool.get(tenantId);
    if (!entry || entry.state !== 'sleeping') return;

    entry.state = 'waking';
    console.log(`[pool] ▲ מעיר ${tenantId}`);

    try {
        await startTenant(tenantId, handleIncomingWAMessage);
        const connected = await waitForConnected(tenantId, 30_000);
        if (connected) {
            entry.state = 'active';
            await flushPending(tenantId);
        } else {
            console.warn(`[pool] ${tenantId} לא התחבר תוך 30ש׳ — מדלג`);
        }
        await wait(SYNC_WINDOW);
    } catch (err) {
        console.error(`[pool] שגיאה ${tenantId}:`, err.message);
        logger.error('pool', `cycle error: ${err.message}`, { tenantId, stack: err.stack });
    } finally {
        if (pool.has(tenantId)) {
            entry.state = 'sleeping';
            sleepTenant(tenantId);
            console.log(`[pool] ▼ נרדם ${tenantId}`);
        }
    }
};

// ─── Public API ──────────────────────────────────────────────────

export const poolAdd = (tenantId, tenant) => {
    if (pool.has(tenantId)) {
        pool.get(tenantId).tenant = tenant;
        return;
    }
    pool.set(tenantId, { tenant, state: 'sleeping', pendingSends: [] });
    startBridge(tenantId, tenant);
    console.log(`[pool] + ${tenantId} (סה"כ: ${pool.size})`);
};

export const poolRemove = (tenantId) => {
    sleepTenant(tenantId);
    stopBridge(tenantId);
    pool.delete(tenantId);
    prioritySet.delete(tenantId);
    console.log(`[pool] - ${tenantId} (סה"כ: ${pool.size})`);
};

export const poolUpdateTenant = (tenantId, updatedTenant) => {
    const entry = pool.get(tenantId);
    if (entry) entry.tenant = updatedTenant;
};

// נקרא כשמגיעה תשובת מייל ויש להעביר ל-WA
export const poolQueueSend = (tenantId, sendFn) => {
    const entry = pool.get(tenantId);
    if (!entry) return;
    entry.pendingSends.push(sendFn);
    if (entry.state === 'active') {
        flushPending(tenantId);
    } else {
        prioritySet.add(tenantId);
    }
};

// כפיית התעוררות — אדמין לחץ reconnect / QR
export const poolForceWake = (tenantId) => {
    prioritySet.add(tenantId);
};

export const getPoolStatus = () => ({
    total:    pool.size,
    active:   [...pool.values()].filter(e => e.state === 'active').length,
    waking:   [...pool.values()].filter(e => e.state === 'waking').length,
    sleeping: [...pool.values()].filter(e => e.state === 'sleeping').length,
    maxActive: MAX_ACTIVE,
    syncWindowMs: SYNC_WINDOW,
});

// ─── לולאת קונבייר ───────────────────────────────────────────────

export const startConveyor = () => {
    if (loopRunning) return;
    loopRunning = true;
    _loop();
    console.log(`[pool] קונבייר הופעל — max=${MAX_ACTIVE}, sync=${SYNC_WINDOW}ms`);
};

const _loop = async () => {
    while (loopRunning) {
        try {
            // 1. עדיפות — מיילים שממתינים לשליחה
            for (const id of [...prioritySet]) {
                if (activeCount() >= MAX_ACTIVE) break;
                const e = pool.get(id);
                if (!e) { prioritySet.delete(id); continue; }
                if (e.state === 'sleeping') {
                    prioritySet.delete(id);
                    runCycle(id); // fire and forget
                } else {
                    prioritySet.delete(id); // כבר ער, flush יטפל
                }
            }

            // 2. קונבייר — ממלא slots פנויים בסדר מחזורי
            const ids = [...pool.keys()];
            if (ids.length > 0) {
                let checked = 0;
                while (activeCount() < MAX_ACTIVE && checked < ids.length) {
                    if (conveyorPos >= ids.length) conveyorPos = 0;
                    const id = ids[conveyorPos++];
                    checked++;
                    const e = pool.get(id);
                    if (e?.state === 'sleeping' && !prioritySet.has(id)) {
                        runCycle(id); // fire and forget
                    }
                }
            }
        } catch (err) {
            console.error('[pool] שגיאה בלולאת קונבייר:', err.message);
            logger.error('pool', `conveyor loop error: ${err.message}`, { stack: err.stack });
        }

        await wait(200);
    }
};
