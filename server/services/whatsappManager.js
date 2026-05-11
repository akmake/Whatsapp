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

// tenantId => { sock, state, qr, status, msgCache, onMessage }
const instances = new Map();

const getSessionDir = (tenantId) => path.join(SESSIONS_DIR, tenantId);

export const getStatus = (tenantId) => {
    const inst = instances.get(tenantId);
    if (!inst) return 'disconnected';
    return inst.status;
};

export const getQR = (tenantId) => {
    const inst = instances.get(tenantId);
    return inst?.qr || null;
};

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

export const startTenant = async (tenantId, onMessage) => {
    if (instances.has(tenantId)) {
        const existing = instances.get(tenantId);
        if (existing.status === 'connected') return;
        existing.sock?.end?.();
        instances.delete(tenantId);
    }

    const sessionDir = getSessionDir(tenantId);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const msgCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

    const inst = {
        sock: null, qr: null, status: 'connecting', msgCache, onMessage,
        stats: {
            msgsReceived: 0,
            msgsSent: 0,
            reconnectCount: 0,
            connectedAt: null,
            lastMsgAt: null,
            lastMsgDirection: null,
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
    });

    inst.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            inst.qr = await QRCode.toDataURL(qr);
            inst.status = 'waiting_qr';
            console.log(`[${tenantId}] QR מוכן לסריקה`);
        }

        if (connection === 'open') {
            inst.status = 'connected';
            inst.qr = null;
            inst.stats.connectedAt = new Date().toISOString();
            console.log(`[${tenantId}] מחובר`);
        }

        if (connection === 'close') {
            const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
            const shouldReconnect = code !== DisconnectReason.loggedOut;
            inst.status = 'disconnected';
            console.log(`[${tenantId}] מנותק (קוד: ${code})`);

            if (shouldReconnect) {
                inst.stats.reconnectCount++;
                setTimeout(() => startTenant(tenantId, onMessage), 5000);
            } else {
                // נותק בכוונה — מוחקים session
                instances.delete(tenantId);
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const m of messages) {
            if (!m.message || m.key.fromMe || m.key.remoteJid === 'status@broadcast') continue;
            if (msgCache.get(m.key.id)) continue;
            msgCache.set(m.key.id, true);

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
};

export const stopTenant = (tenantId) => {
    const inst = instances.get(tenantId);
    if (inst?.sock) {
        inst.sock.end();
    }
    instances.delete(tenantId);
    console.log(`[${tenantId}] עצור`);
};

export const getAllStatuses = () => {
    const result = {};
    for (const [id, inst] of instances.entries()) {
        result[id] = inst.status;
    }
    return result;
};

export const getAllStats = () => {
    const result = {};
    for (const [id, inst] of instances.entries()) {
        result[id] = { status: inst.status, ...inst.stats };
    }
    return result;
};

export const extractPhone = (msg) => {
    const jid = msg.key.remoteJid || '';
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

export const downloadMedia = async (msg, sock) => {
    return await downloadMediaMessage(msg, 'buffer', {}, {
        logger: pino({ level: 'silent' }),
        reuploadRequest: sock,
    });
};
