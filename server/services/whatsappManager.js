import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadMediaMessage,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import NodeCache from 'node-cache';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = path.join(__dirname, '../sessions');

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const MAX_RECONNECT_ATTEMPTS = 15;
const BASE_RECONNECT_DELAY = 3000;

// tenantId => { sock, state, qr, status, msgCache, onMessage, reconnectLock,
//               reconnectAttempts, heartbeatInterval, lastEventTimestamp, stats }
const instances = new Map();

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

export const getStatus = (tenantId) => instances.get(tenantId)?.status ?? 'disconnected';
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

export const getMessageText = (msg) => {
    const m = msg.message;
    if (!m) return '';
    return m.conversation
        || m.extendedTextMessage?.text
        || m.imageMessage?.caption
        || m.videoMessage?.caption
        || m.documentMessage?.caption
        || '';
};

export const getMessageType = (msg) => {
    const m = msg.message;
    if (!m) return 'unknown';
    return Object.keys(m).find(k =>
        !['messageContextInfo', 'senderKeyDistributionMessage'].includes(k)
    ) || 'unknown';
};

export const downloadMedia = async (msg, sock) =>
    await downloadMediaMessage(msg, 'buffer', {}, {
        logger: pino({ level: 'silent' }),
        reuploadRequest: sock,
    });

// ─── heartbeat ───────────────────────────────────────────────

const stopHeartbeat = (inst) => {
    if (inst.heartbeatInterval) {
        clearInterval(inst.heartbeatInterval);
        inst.heartbeatInterval = null;
    }
};

const startHeartbeat = (tenantId, inst) => {
    stopHeartbeat(inst);
    inst.heartbeatInterval = setInterval(async () => {
        const silentMin = (Date.now() - inst.lastEventTimestamp) / 60000;
        if (silentMin > 10) {
            console.warn(`[${tenantId}] 💀 heartbeat: שתיקה ${Math.round(silentMin)} דקות`);
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
                await forceReconnect(tenantId, 'heartbeat_error');
            }
        }
    }, 2 * 60 * 1000);
};

// ─── reconnect ───────────────────────────────────────────────

const scheduleReconnect = (tenantId, reason) => {
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
    setTimeout(() => startTenant(tenantId, inst.onMessage), delay);
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
        lidToPhone: existing?.lidToPhone ?? {}, // LID → phone JID mapping
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
            startHeartbeat(tenantId, inst);
        }

        if (connection === 'close') {
            stopHeartbeat(inst);
            inst.status = 'disconnected';

            const error = lastDisconnect?.error;
            const code = (error instanceof Boom)
                ? error.output?.statusCode
                : error?.output?.statusCode;

            const isLoggedOut = code === DisconnectReason.loggedOut;
            const isRestartRequired = code === DisconnectReason.restartRequired;

            console.log(`[${tenantId}] 🔌 מנותק | code=${code} loggedOut=${isLoggedOut}`);

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
            if (c.lid && c.id) inst.lidToPhone[c.lid] = c.id;
        }
    });

    sock.ev.on('messages.update',       () => touch(inst));
    sock.ev.on('message-receipt.update',() => touch(inst));
    sock.ev.on('presence.update',       () => touch(inst));
    sock.ev.on('chats.update',          () => touch(inst));
    sock.ev.on('contacts.update',       () => touch(inst));
};

export const stopTenant = (tenantId) => {
    const inst = instances.get(tenantId);
    if (!inst) return;
    stopHeartbeat(inst);
    try { inst.sock?.end(); } catch (e) { /* ok */ }
    instances.delete(tenantId);
    console.log(`[${tenantId}] עצור`);
};
