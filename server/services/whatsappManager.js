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
import { downloadMedia } from './waMessageUtils.js';
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

// שומר שם איש קשר + מיפוי LID מתוך אובייקט contact של Baileys.
// מפריד בין השם השמור (c.name — מפנקס הכתובות) ל-pushName (c.notify),
// כדי ש-pushName לא ידרוס שם שמור. עדכון רק כשיש ערך (לא דורסים בריק).
const storeContact = (inst, c) => {
    if (!c) return;
    const saved = c.name || c.verifiedName || '';   // השם השמור / עסקי מאומת
    const push  = c.notify || '';                    // איך איש הקשר קורא לעצמו
    for (const key of [c.id, c.lid].filter(Boolean)) {
        if (saved) inst.contactName[key]   = saved;
        if (push)  inst.contactNotify[key] = push;
    }
    if (c.lid && c.id) inst.lidToPhone[c.lid] = c.id;
};

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

export const sendMessage = async (tenantId, jid, content, options) => {
    const inst = instances.get(tenantId);
    if (!inst?.sock) throw new Error('לא מחובר');
    inst.stats.msgsSent++;
    inst.stats.lastMsgAt = new Date().toISOString();
    inst.stats.lastMsgDirection = 'wa_out';
    return await inst.sock.sendMessage(jid, content, options);
};

// הורדת המדיה של הודעה (משתמש ב-sock של ה-tenant ל-reupload במידת הצורך).
// משמש את לולאת בדיקת האיכות — מורידים בחזרה סטטוס שהעלינו ובודקים מה השתנה.
export const downloadMessageMedia = async (tenantId, msg) => {
    const inst = instances.get(tenantId);
    if (!inst?.sock) throw new Error('לא מחובר');
    return await downloadMedia(msg, inst.sock);
};

// ה-jid של החשבון עצמו (בלי סיומת המכשיר) — לבדיקת איכות שולחים רק לעצמנו.
export const getOwnJid = (tenantId) => {
    const id = instances.get(tenantId)?.sock?.user?.id || '';
    return id ? id.replace(/:\d+@/, '@') : '';
};

// מחיקת הודעה (delete-for-everyone). משמש למחיקת סטטוס הבדיקה אחרי ההורדה.
export const deleteMessage = async (tenantId, jid, key) => {
    const inst = instances.get(tenantId);
    if (!inst?.sock) throw new Error('לא מחובר');
    return await inst.sock.sendMessage(jid, { delete: key });
};

// כל ה-jid של אנשי הקשר (טלפון) — לרשימת נמעני הסטטוס (statusJidList).
export const getContactJids = (tenantId) => {
    const inst = instances.get(tenantId);
    if (!inst) return [];
    const set = new Set();
    for (const k of Object.keys(inst.contactName || {})) if (k.endsWith('@s.whatsapp.net')) set.add(k);
    for (const v of Object.values(inst.lidToPhone || {})) if (typeof v === 'string' && v.endsWith('@s.whatsapp.net')) set.add(v);
    return [...set];
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

export const extractPhone = (msg, tenantId) =>
    resolvePhone(tenantId, msg.key.remoteJid || '');

// ממיר jid כלשהו (כולל @lid) למספר טלפון, לפי מיפוי ה-LID של ה-instance.
// מחזיר '' אם זה @lid שעוד לא מופה (לא יודעים מי זה).
export const resolvePhone = (tenantId, rawJid = '') => {
    // נרמול סיומת מכשיר: 123:5@lid -> 123@lid
    const jid = rawJid.replace(/:\d+@/, '@');
    if (jid.endsWith('@lid')) {
        const inst = instances.get(tenantId);
        const phoneJid = inst?.lidToPhone?.[jid] || '';
        return phoneJid ? phoneJid.replace('@s.whatsapp.net', '').replace(/\D/g, '') : '';
    }
    return jid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
};

// מחזיר { phone, name, pushName } עבור jid כלשהו — נפתר בזמן אמת ממיפויי ה-instance.
// name = השם השמור (מועדף); pushName = איך איש הקשר קורא לעצמו (גיבוי לתצוגה).
export const resolveContact = (tenantId, rawJid = '') => {
    const jid = rawJid.replace(/:\d+@/, '@');
    const inst = instances.get(tenantId);
    const phone = resolvePhone(tenantId, jid);
    const phoneJid = phone ? `${phone}@s.whatsapp.net` : '';
    const pick = (map) => inst?.[map]?.[jid] || (phoneJid && inst?.[map]?.[phoneJid]) || '';
    return { phone, name: pick('contactName'), pushName: pick('contactNotify') };
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
        if (!noReconnect.has(tenantId)) startTenant(tenantId, inst.onMessage, {
            onStatusPost: inst.onStatusPost,
            onStatusReceipt: inst.onStatusReceipt,
            onStatusMedia: inst.onStatusMedia,
            emitOwnEvents: inst.emitOwnEvents,
        });
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

// opts (אופציונלי, ל-BTB): { onStatusPost(tenantId, m), onStatusReceipt(tenantId, view) }
// כש-opts לא מסופק — ההתנהגות זהה לחלוטין ל-WTM.
export const startTenant = async (tenantId, onMessage, opts = {}) => {
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
        // BTB hooks (אופציונלי) — נשמרים בין reconnect-ים
        onStatusPost:    opts.onStatusPost    ?? existing?.onStatusPost    ?? null,
        onStatusReceipt: opts.onStatusReceipt ?? existing?.onStatusReceipt ?? null,
        onStatusMedia:   opts.onStatusMedia   ?? existing?.onStatusMedia   ?? null,
        emitOwnEvents:   opts.emitOwnEvents   ?? existing?.emitOwnEvents   ?? false,
        reconnectLock: false,
        reconnectAttempts: existing?.reconnectAttempts ?? 0,
        heartbeatInterval: null,
        lastEventTimestamp: Date.now(),
        lidToPhone, // LID → phone JID mapping (loaded from session files)
        contactName:   existing?.contactName   ?? {}, // jid → שם שמור (פנקס כתובות)
        contactNotify: existing?.contactNotify ?? {}, // jid → pushName (איך הוא קורא לעצמו)
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
        emitOwnEvents: inst.emitOwnEvents, // BTB=true (צריך את הסטטוסים שלך), WTM=false
        markOnlineOnConnect: true,
        syncFullHistory: false, // מתייחסים רק להודעות מתחילת החיבור — ללא סנכרון היסטוריה
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

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        touch(inst);
        for (const m of messages) {
            // BTB: סטטוס שעלה (מהטלפון או מאיתנו) — מטופל ללא תלות ב-type
            if (m.key.remoteJid === 'status@broadcast') {
                if (inst.onStatusPost) {
                    const mtype = m.message ? Object.keys(m.message).filter(k => k !== 'messageContextInfo')[0] : null;
                    logger.warn('btb', '[DIAG] upsert status@broadcast', { tenantId, type, fromMe: !!m.key.fromMe, hasMsg: !!m.message, mtype, participant: m.key.participant || null });
                    if (m.key.fromMe && m.message) {
                        try { await inst.onStatusPost(tenantId, m); }
                        catch (err) { console.error(`[${tenantId}] status post hook:`, err.message); }
                    }
                }
                continue;
            }
            if (type !== 'notify') continue;
            if (!m.message || m.key.fromMe) continue;
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

    const handleContacts = (contacts) => {
        touch(inst);
        for (const c of contacts || []) {
            storeContact(inst, c);
            if (c.lid && c.id) {
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
    };
    sock.ev.on('contacts.upsert', handleContacts);
    sock.ev.on('contacts.update', handleContacts);

    // סנכרון ראשוני (גם כש-syncFullHistory=false) מביא את רשימת אנשי הקשר => שמות
    sock.ev.on('messaging-history.set', ({ contacts }) => {
        touch(inst);
        for (const c of contacts || []) storeContact(inst, c);
    });

    sock.ev.on('messages.update',       () => touch(inst));

    // BTB: אישורי צפייה בסטטוס => תיעוד צופים. ל-WTM (ללא hook) רק touch.
    sock.ev.on('message-receipt.update', async (updates) => {
        touch(inst);
        if (!inst.onStatusReceipt) return;
        for (const u of updates) {
            if (u?.key?.remoteJid !== 'status@broadcast') continue;
            const r = u.receipt || {};
            logger.warn('btb', '[DIAG] receipt status@broadcast', { tenantId, fromMe: !!u.key.fromMe, msgId: u.key.id, userJid: r.userJid || null, read: !!r.readTimestamp, played: !!r.playedTimestamp });
            if (!u.key.fromMe) continue;
            const viewerJid = r.userJid;
            if (!viewerJid) continue;
            // רק צפייה ממשית (read/played), לא אישור מסירה בלבד
            const tsRaw = r.playedTimestamp || r.readTimestamp;
            if (!tsRaw) continue;
            try {
                await inst.onStatusReceipt(tenantId, {
                    msgId: u.key.id,
                    viewerJid,
                    viewedAt: new Date(Number(tsRaw) * 1000),
                    receiptType: r.playedTimestamp ? 'played' : 'read',
                });
            } catch (err) { console.error(`[${tenantId}] status receipt hook:`, err.message); }
        }
    });


    sock.ev.on('presence.update',       () => touch(inst));
    sock.ev.on('chats.update',          () => touch(inst));
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
