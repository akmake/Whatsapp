import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import NodeCache from 'node-cache';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
export { getMessageText, getMessageType, downloadMedia } from './waMessageUtils.js';
import { broadcast } from './sseManager.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = path.join(__dirname, '../sessions');

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const MAX_RECONNECT_ATTEMPTS = 15;
const BASE_RECONNECT_DELAY = 3000;

// tenantId => { sock, state, qr, status, msgCache, onMessage, reconnectLock,
//               reconnectAttempts, heartbeatInterval, lastEventTimestamp, stats }
const instances = new Map();

// tenantIds שנרדמו בכוונה — מונע reconnect אוטומטי עד שהדגל יפוג
const noReconnect = new Set();

const getSessionDir = (tenantId) => path.join(SESSIONS_DIR, tenantId);

// ─── helpers ────────────────────────────────────────────────

const touch = (inst) => { inst.lastEventTimestamp = Date.now(); };

const getReconnectDelay = (attempts) => {
    const exp = BASE_RECONNECT_DELAY * Math.pow(2, attempts);
    const max = 5 * 60 * 1000;
    const delay = Math.min(exp, max);
    return delay + delay * Math.random() * 0.5;
};

// ─── exports ─────────────────────────────────────────────────

export const getStatus        = (tenantId) => instances.get(tenantId)?.status ?? 'disconnected';
export const isHistorySyncing = (tenantId) => instances.get(tenantId)?.historySyncing ?? false;
export const getQR     = (tenantId) => instances.get(tenantId)?.qr ?? null;
export const isConnected = (tenantId) => {
    const inst = instances.get(tenantId);
    return inst?.status === 'connected' && inst?.sock?.user != null;
};

export const sendMessage = async (tenantId, jid, content) => {
    const inst = instances.get(tenantId);
    if (!inst?.sock) throw new Error('לא מחובר');
    inst.stats.msgsSent++;
    inst.stats.lastMsgAt = new Date().toISOString();
    inst.stats.lastMsgDirection = 'wa_out';
    return await inst.sock.sendMessage(jid, content);
};

export const fetchGroups = async (tenantId) => {
    const inst = instances.get(tenantId);
    if (!inst?.sock) throw new Error('לא מחובר');
    const groups = await inst.sock.groupFetchAllParticipating();
    return Object.values(groups).map(g => ({
        groupId:   g.id.replace('@g.us', ''),
        groupName: g.subject,
        size:      g.participants?.length ?? 0,
    }));
};

export const sendPresence = async (tenantId, jid, type) => {
    const inst = instances.get(tenantId);
    if (!inst?.sock) return;
    try { await inst.sock.sendPresenceUpdate(type, jid); } catch (e) {}
};

export const getAllStatuses = () => {
    const result = {};
    for (const [id, inst] of instances) result[id] = inst.status;
    return result;
};

export const getAllStats = () => {
    const result = {};
    for (const [id, inst] of instances) result[id] = { status: inst.status, ...inst.stats };
    return result;
};

export const extractPhone = (msg, tenantId) => {
    const jid = msg.key.remoteJid || '';
    if (jid.endsWith('@lid') && tenantId) {
        const inst = instances.get(tenantId);
        const phoneJid = inst?.lidToPhone?.[jid] || '';
        if (phoneJid) return phoneJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    }
    return jid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
};

// ─── heartbeat ───────────────────────────────────────────────

const stopHeartbeat = (inst) => {
    if (inst.heartbeatInterval) {
        clearInterval(inst.heartbeatInterval);
        inst.heartbeatInterval = null;
    }
};

const startHeartbeat = (tenantId, inst) => {
    // Guard: if the instance was already removed (race with sleepTenant), don't start
    if (instances.get(tenantId) !== inst) return;
    stopHeartbeat(inst);
    inst.heartbeatInterval = setInterval(async () => {
        // Guard: stop the interval if this instance is no longer active
        if (instances.get(tenantId) !== inst) { stopHeartbeat(inst); return; }
        const silentMin = (Date.now() - inst.lastEventTimestamp) / 60000;
        if (silentMin > 10) {
            console.warn(`[${tenantId}] 💀 heartbeat: שתיקה ${Math.round(silentMin)} דקות`);
            logger.warn('wa', `heartbeat silence ${Math.round(silentMin)}m`, { tenantId, silentMin });
            try {
                if (inst.sock?.user) {
                    await inst.sock.sendPresenceUpdate('available');
                    touch(inst);
                    console.log(`[${tenantId}] ✅ heartbeat ping OK`);
                } else {
                    await forceReconnect(tenantId, 'no_user_in_heartbeat');
                }
            } catch (err) {
                console.error(`[${tenantId}] 💀 heartbeat ping נכשל:`, err.message);
                logger.error('wa', `heartbeat ping failed: ${err.message}`, { tenantId });
                await forceReconnect(tenantId, 'heartbeat_error');
            }
        }
    }, 2 * 60 * 1000);
};

// ─── reconnect ───────────────────────────────────────────────

const scheduleReconnect = (tenantId, reason) => {
    if (noReconnect.has(tenantId)) return;
    const inst = instances.get(tenantId);
    if (!inst || inst.reconnectLock) return;

    if (inst.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error(`[${tenantId}] 🚫 הגיע למקסימום reconnects — עוצר`);
        inst.status = 'disconnected';
        return;
    }

    const delay = getReconnectDelay(inst.reconnectAttempts);
    console.log(`[${tenantId}] 🔄 reconnect #${inst.reconnectAttempts + 1} בעוד ${Math.round(delay / 1000)}ש׳ (${reason})`);
    inst.stats.reconnectCount++;
    setTimeout(() => {
        if (!noReconnect.has(tenantId)) startTenant(tenantId, inst.onMessage);
    }, delay);
};

const forceReconnect = async (tenantId, reason) => {
    const inst = instances.get(tenantId);
    if (!inst || inst.reconnectLock) return;
    inst.reconnectLock = true;

    stopHeartbeat(inst);
    inst.status = 'disconnected';

    if (inst.sock) {
        try { inst.sock.end(); } catch (e) { /* ok */ }
        inst.sock = null;
        inst.reconnectLock = false;
        // close handler יטפל ב-reconnect
    } else {
        inst.sock = null;
        inst.reconnectLock = false;
        inst.reconnectAttempts++;
        scheduleReconnect(tenantId, reason);
    }
};

// ─── main ────────────────────────────────────────────────────

export const startTenant = async (tenantId, onMessage) => {
    const existing = instances.get(tenantId);
    if (existing) {
        if (existing.reconnectLock) return;
        if (existing.status === 'connected') return;
        stopHeartbeat(existing);
        try { existing.sock?.end?.(); } catch (e) { /* ok */ }
        instances.delete(tenantId);
    }

    const sessionDir = getSessionDir(tenantId);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    // Build LID → phone mapping from session files (lid-mapping-{phone}.json contain the LID)
    const lidToPhone = existing?.lidToPhone ?? {};
    try {
        const files = fs.readdirSync(sessionDir).filter(f => f.startsWith('lid-mapping-') && !f.includes('_reverse'));
        for (const file of files) {
            const phone = file.replace('lid-mapping-', '').replace('.json', '');
            const lid = JSON.parse(fs.readFileSync(path.join(sessionDir, file), 'utf8'));
            if (lid) lidToPhone[`${lid}@lid`] = `${phone}@s.whatsapp.net`;
        }
    } catch (e) { /* ok if no files yet */ }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const msgCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

    const inst = {
        sock: null, qr: null, status: 'connecting',
        msgCache, onMessage,
        reconnectLock: false,
        reconnectAttempts: existing?.reconnectAttempts ?? 0,
        heartbeatInterval: null,
        lastEventTimestamp: Date.now(),
        lidToPhone, // LID → phone JID mapping (loaded from session files)
        historySyncing: false, // true while messaging-history.set batches are arriving
        stats: {
            msgsReceived: 0, msgsSent: 0, reconnectCount: 0,
            connectedAt: null, lastMsgAt: null, lastMsgDirection: null,
        }
    };
    instances.set(tenantId, inst);

    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        version,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Bridge Server', 'Chrome', '1.0.0'],
        defaultQueryTimeoutMs: 60_000,
        keepAliveIntervalMs: 30_000,
        retryRequestDelayMs: 2_000,
        connectTimeoutMs: 60_000,
        emitOwnEvents: false,
        markOnlineOnConnect: true,
        syncFullHistory: true,
        getMessage: async () => ({ conversation: '' }),
    });

    inst.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        touch(inst);

        if (qr) {
            inst.qr = await QRCode.toDataURL(qr);
            inst.status = 'waiting_qr';
            console.log(`[${tenantId}] QR מוכן לסריקה`);
        }

        if (connection === 'open') {
            inst.status = 'connected';
            inst.qr = null;
            inst.reconnectAttempts = 0;
            inst.reconnectLock = false;
            inst.stats.connectedAt = new Date().toISOString();
            console.log(`[${tenantId}] ✅ מחובר`);
            logger.info('wa', 'connected', { tenantId });
            startHeartbeat(tenantId, inst);
            broadcast('wa_status');
        }

        if (connection === 'close') {
            stopHeartbeat(inst);
            inst.status = 'disconnected';
            broadcast('wa_status');

            const error = lastDisconnect?.error;
            const code = (error instanceof Boom)
                ? error.output?.statusCode
                : error?.output?.statusCode;

            const isLoggedOut = code === DisconnectReason.loggedOut;
            const isRestartRequired = code === DisconnectReason.restartRequired;

            console.log(`[${tenantId}] 🔌 מנותק | code=${code} loggedOut=${isLoggedOut}`);
            logger.warn('wa', `disconnected code=${code}`, { tenantId, code, isLoggedOut });

            if (isLoggedOut) {
                console.warn(`[${tenantId}] ⛔ Logged Out — מוחק session`);
                try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) { /* ok */ }
                inst.reconnectAttempts = 0;
                inst.reconnectLock = false;
                scheduleReconnect(tenantId, 'logged_out');
            } else if (isRestartRequired) {
                inst.reconnectAttempts = 0;
                inst.reconnectLock = false;
                scheduleReconnect(tenantId, 'restart_required');
            } else {
                inst.reconnectAttempts++;
                inst.reconnectLock = false;
                scheduleReconnect(tenantId, `close_${code}`);
            }
        }
    });

    sock.ev.on('messaging-history.set', async ({ messages: histMsgs, isLatest }) => {
        touch(inst);
        inst.historySyncing = true;
        console.log(`[${tenantId}] סנכרון היסטוריה: ${histMsgs.length} הודעות (isLatest=${isLatest})`);
        for (const m of histMsgs) {
            if (!m.message || m.key.fromMe || m.key.remoteJid === 'status@broadcast') continue;
            if (inst.msgCache.get(m.key.id)) continue;
            inst.msgCache.set(m.key.id, true);
            try {
                await onMessage(tenantId, m, sock, { isHistory: true });
            } catch (err) {
                console.error(`[${tenantId}] שגיאה בהיסטוריה:`, err.message);
            }
        }
        if (isLatest) {
            inst.historySyncing = false;
            console.log(`[${tenantId}] ✅ סנכרון היסטוריה הושלם`);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        touch(inst);
        if (type !== 'notify') return;
        for (const m of messages) {
            if (!m.message || m.key.fromMe || m.key.remoteJid === 'status@broadcast') continue;
            if (inst.msgCache.get(m.key.id)) continue;
            inst.msgCache.set(m.key.id, true);
            try {
                inst.stats.msgsReceived++;
                inst.stats.lastMsgAt = new Date().toISOString();
                inst.stats.lastMsgDirection = 'wa_in';
                await onMessage(tenantId, m, sock);
            } catch (err) {
                console.error(`[${tenantId}] שגיאה בטיפול בהודעה:`, err.message);
            }
        }
    });

    sock.ev.on('contacts.upsert', (contacts) => {
        touch(inst);
        for (const c of contacts) {
            if (c.lid && c.id) {
                inst.lidToPhone[c.lid] = c.id;
                // Persist to disk so mapping survives sleep/restart
                const phone = c.id.replace('@s.whatsapp.net', '');
                const lid   = c.lid.replace('@lid', '');
                try {
                    fs.writeFileSync(
                        path.join(getSessionDir(tenantId), `lid-mapping-${phone}.json`),
                        JSON.stringify(lid)
                    );
                } catch (e) {}
            }
        }
    });

    sock.ev.on('messages.update',       () => touch(inst));
    sock.ev.on('message-receipt.update',() => touch(inst));
    sock.ev.on('presence.update',       () => touch(inst));
    sock.ev.on('chats.update',          () => touch(inst));
    sock.ev.on('contacts.update',       () => touch(inst));
};

export const waitForConnected = (tenantId, timeoutMs = 30_000) =>
    new Promise((resolve) => {
        if (isConnected(tenantId)) return resolve(true);
        const deadline = Date.now() + timeoutMs;
        const poll = setInterval(() => {
            if (isConnected(tenantId)) {
                clearInterval(poll);
                resolve(true);
            } else if (!instances.has(tenantId) || Date.now() >= deadline) {
                clearInterval(poll);
                resolve(false);
            }
        }, 500);
    });

export const stopTenant = (tenantId) => {
    const inst = instances.get(tenantId);
    if (!inst) return;
    stopHeartbeat(inst);
    try { inst.sock?.end(); } catch (e) { /* ok */ }
    instances.delete(tenantId);
    console.log(`[${tenantId}] עצור`);
};

// מחיקת session — יגרום ל-QR חדש בחיבור הבא + history sync מלא
export const resetSession = (tenantId) => {
    stopTenant(tenantId);
    const sessionDir = getSessionDir(tenantId);
    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) { /* ok */ }
    console.log(`[${tenantId}] session נמחק`);
};

// ניתוק עדין בלי מחיקת session — לשימוש הקונבייר
export const sleepTenant = (tenantId) => {
    const inst = instances.get(tenantId);
    // מסמנים noReconnect כדי שה-close handler לא יפעיל reconnect
    noReconnect.add(tenantId);
    setTimeout(() => noReconnect.delete(tenantId), 30_000);

    if (!inst) return;
    stopHeartbeat(inst);
    try { inst.sock?.end(); } catch (e) { /* ok */ }
    instances.delete(tenantId);
    console.log(`[${tenantId}] נרדם`);
};
