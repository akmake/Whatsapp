import imap from 'imap-simple';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { isConnected, sendMessage, extractPhone, getMessageText, getMessageType, downloadMedia } from './whatsappManager.js';

// tenantId => { interval, healthInterval, connection, stats, reconnectAttempts }
const bridges = new Map();

const getImapReconnectDelay = (attempts) => {
    const delay = Math.min(BASE_IMAP_RECONNECT * Math.pow(2, attempts), MAX_IMAP_RECONNECT);
    return delay + delay * Math.random() * 0.3;
};

const POLL_INTERVAL = 60_000;
const HEALTH_INTERVAL = 5 * 60_000;
const BASE_IMAP_RECONNECT = 15_000;
const MAX_IMAP_RECONNECT = 5 * 60_000;

// ============================================================
// ניקוי גוף מייל — מסיר ציטוטים וחתימות
// ============================================================
const SIGNATURE_ANCHORS = [
    /טלפון[\s:]*[\d\-\+]/,
    /נייד[\s:]*[\d\-\+]/,
    /tel[\s.:]*[\d\-\+]/i,
    /phone[\s.:]*[\d\-\+]/i,
];

const cleanEmailBody = (text) => {
    if (!text) return '';
    const lines = text.split(/\r?\n/);
    let bodyLines = [];
    for (const line of lines) {
        const t = line.trim();
        if ((t.includes('On ') && t.includes(' wrote')) || /^On .* wrote:$/i.test(t)) break;
        if (t.includes('בתאריך') && t.includes('מאת')) break;
        if (/^From:\s/i.test(t) || /^_{3,}/.test(t) || /^-{3,}/.test(t) || t.startsWith('>')) break;
        bodyLines.push(line);
    }
    const sepIdx = bodyLines.findIndex(l => /^--\s*$/.test(l.trim()));
    if (sepIdx !== -1) return bodyLines.slice(0, sepIdx).join('\n').trim();
    return bodyLines.join('\n').trim();
};

// ============================================================
// שליחת מייל (WA → Email)
// ============================================================
export const sendEmailToTenant = async (tenant, fromPhone, senderName, textContent, attachments = []) => {
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: tenant.bridgeEmail, pass: tenant.bridgeEmailPassword },
    });

    const today = new Date().toLocaleDateString('he-IL').replace(/\./g, '/');
    const subject = `WA_MSG: ${fromPhone} [${today}]`;

    const html = `
        <div dir="rtl" style="font-family: Arial; text-align: right;">
            <p style="font-size: 1.1em; color: #000;">
                <strong>${senderName}:</strong><br>
                ${(textContent || '').replace(/\n/g, '<br>')}
            </p>
        </div>
    `;

    await transporter.sendMail({
        from: tenant.bridgeEmail,
        to: tenant.destinationEmail,
        subject,
        html,
        attachments: attachments.map(a => ({ filename: a.filename, content: a.content })),
    });
};

// ============================================================
// פולינג IMAP — Email → WA
// ============================================================
const pollEmails = async (tenantId, tenant, connection) => {
    try {
        const messages = await connection.search(['UNSEEN'], {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: false,
            struct: true,
        });

        if (messages.length === 0) return;

        const bridge = bridges.get(tenantId);
        if (!bridge) return;

        for (const item of messages) {
            const uid = item.attributes.uid;
            if (bridge.processing?.has(uid)) continue;
            bridge.processing.add(uid);

            try {
                const all = item.parts.find(p => p.which === '');
                const parsed = await simpleParser(`Imap-Id: ${uid}\r\n` + all.body);

                const fromEmail = parsed.from?.value?.[0]?.address || '';
                const subject = parsed.subject || '';

                // מקבל רק תשובות מהמייל האישי של הלקוח
                if (fromEmail.toLowerCase() !== tenant.destinationEmail.toLowerCase()) {
                    await connection.addFlags(uid, ['\\Seen']);
                    bridge.processing.delete(uid);
                    continue;
                }

                if (!subject.includes('WA_MSG:')) {
                    await connection.addFlags(uid, ['\\Seen']);
                    bridge.processing.delete(uid);
                    continue;
                }

                const match = subject.match(/WA_MSG:\s*([0-9\-\+]+)/);
                if (!match) {
                    await connection.addFlags(uid, ['\\Seen']);
                    bridge.processing.delete(uid);
                    continue;
                }

                const phone = match[1].trim().replace(/\D/g, '');
                const jid = `${phone}@s.whatsapp.net`;

                if (!isConnected(tenantId)) {
                    bridge.processing.delete(uid);
                    continue;
                }

                const body = cleanEmailBody(parsed.text);

                if (body) {
                    await sendMessage(tenantId, jid, { text: body });
                }

                if (parsed.attachments?.length) {
                    for (const att of parsed.attachments) {
                        let content = {};
                        if (att.contentType.startsWith('image/')) content = { image: att.content, caption: att.filename };
                        else if (att.contentType.startsWith('video/')) content = { video: att.content, caption: att.filename };
                        else if (att.contentType.startsWith('audio/')) content = { audio: att.content, mimetype: 'audio/mp4', ptt: true };
                        else content = { document: att.content, mimetype: att.contentType, fileName: att.filename };
                        await sendMessage(tenantId, jid, content);
                    }
                }

                await connection.addFlags(uid, ['\\Seen']);
                bridge.stats.emailToWa++;
                bridge.stats.lastEmailAt = new Date().toISOString();
                bridge.processing.delete(uid);

            } catch (err) {
                console.error(`[${tenantId}] שגיאה בטיפול במייל uid=${uid}:`, err.message);
                bridge.processing?.delete(uid);
            }
        }
    } catch (err) {
        console.error(`[${tenantId}] שגיאת פולינג:`, err.message);
        if (err.message.includes('Socket') || err.message.includes('Ended')) {
            stopBridge(tenantId);
            setTimeout(() => startBridge(tenantId, tenant), 10_000);
        }
    }
};

// ============================================================
// התחלה / עצירה
// ============================================================
export const startBridge = async (tenantId, tenant) => {
    if (bridges.has(tenantId)) stopBridge(tenantId);

    let connection;
    try {
        connection = await imap.connect({
            imap: {
                user: tenant.bridgeEmail,
                password: tenant.bridgeEmailPassword,
                host: 'imap.gmail.com',
                port: 993,
                tls: true,
                authTimeout: 30000,
                tlsOptions: { rejectUnauthorized: false },
            },
        });
        await connection.openBox('INBOX');
        console.log(`[${tenantId}] IMAP מחובר`);
    } catch (err) {
        const attempts = bridges.get(tenantId)?.reconnectAttempts ?? 0;
        const delay = getImapReconnectDelay(attempts);
        console.error(`[${tenantId}] IMAP חיבור נכשל:`, err.message, `— ניסיון חוזר בעוד ${Math.round(delay/1000)}ש׳`);
        // שומרים את מונה הניסיונות גם בין reconnects
        bridges.set(tenantId, { ...(bridges.get(tenantId) || {}), reconnectAttempts: attempts + 1 });
        setTimeout(() => startBridge(tenantId, tenant), delay);
        return;
    }

    const prev = bridges.get(tenantId);
    const bridge = {
        connection,
        processing: new Set(),
        reconnectAttempts: 0,
        stats: {
            active: true,
            emailToWa: 0,
            waToEmail: 0,
            lastEmailAt: null,
            connectedAt: new Date().toISOString(),
            reconnectCount: prev?.stats?.reconnectCount != null ? prev.stats.reconnectCount + 1 : 0,
        },
        interval: null,
        healthInterval: null,
    };
    bridges.set(tenantId, bridge);

    bridge.interval = setInterval(() => pollEmails(tenantId, tenant, connection), POLL_INTERVAL);

    bridge.healthInterval = setInterval(async () => {
        try {
            if (!connection || connection.imap.state === 'disconnected') {
                stopBridge(tenantId);
                setTimeout(() => startBridge(tenantId, tenant), 1000);
            }
        } catch (e) {}
    }, HEALTH_INTERVAL);

    connection.on('error', (err) => {
        console.error(`[${tenantId}] IMAP שגיאה:`, err.message);
        const attempts = bridges.get(tenantId)?.reconnectAttempts ?? 0;
        stopBridge(tenantId);
        const delay = getImapReconnectDelay(attempts);
        bridges.set(tenantId, { reconnectAttempts: attempts + 1 });
        setTimeout(() => startBridge(tenantId, tenant), delay);
    });
};

export const stopBridge = (tenantId) => {
    const bridge = bridges.get(tenantId);
    if (!bridge) return;
    clearInterval(bridge.interval);
    clearInterval(bridge.healthInterval);
    try { bridge.connection?.end?.(); } catch (e) {}
    bridges.delete(tenantId);
    console.log(`[${tenantId}] גשר מייל עצר`);
};

export const getBridgeStats = (tenantId) => {
    const bridge = bridges.get(tenantId);
    return bridge ? { ...bridge.stats } : { active: false };
};

export const recordWaToEmail = (tenantId) => {
    const bridge = bridges.get(tenantId);
    if (!bridge) return;
    bridge.stats.waToEmail++;
    bridge.stats.lastEmailAt = new Date().toISOString();
};

// בדיקת חיבור IMAP חד-פעמית — לא שומרת state
export const testImapConnection = async (email, password) => {
    let connection;

    const attempt = new Promise(async (resolve) => {
        try {
            connection = await imap.connect({
                imap: {
                    user: email,
                    password,
                    host: 'imap.gmail.com',
                    port: 993,
                    tls: true,
                    authTimeout: 10000,
                    tlsOptions: { rejectUnauthorized: false },
                },
            });
            await connection.openBox('INBOX');
            resolve({ ok: true });
        } catch (err) {
            const msg = err.message || '';
            if (msg.toLowerCase().includes('invalid credentials') || msg.toLowerCase().includes('authentication failed')) {
                resolve({ ok: false, error: 'סיסמת האפ שגויה או שגישת IMAP לא מופעלת בחשבון' });
            } else if (msg.toLowerCase().includes('timeout')) {
                resolve({ ok: false, error: 'תם הזמן — בדוק שגישת IMAP מופעלת בחשבון Gmail' });
            } else {
                resolve({ ok: false, error: `שגיאת חיבור: ${msg}` });
            }
        } finally {
            try { connection?.end?.(); } catch (e) { /* ok */ }
        }
    });

    const timeout = new Promise(resolve =>
        setTimeout(() => resolve({ ok: false, error: 'תם הזמן (20 שניות) — בדוק שגישת IMAP מופעלת ב-Gmail' }), 20000)
    );

    return Promise.race([attempt, timeout]);
};
