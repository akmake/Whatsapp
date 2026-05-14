import imap from 'imap-simple';
import { simpleParser } from 'mailparser';
import { isConnected, sendMessage } from './whatsappManager.js';
import { cleanEmailBody, sendEmailToTenant } from './emailRenderer.js';
import Message from '../models/Message.js';

export { sendEmailToTenant } from './emailRenderer.js';

// callback שמגיע מ-tenantPool — מונע תלות מעגלית
let _queueSend = null;
export const registerQueueSend = (fn) => { _queueSend = fn; };

// tenantId => { connection, emailInterval, healthInterval, stats }
const bridges = new Map();

const processingEmails = new Set();

// ─── פולינג IMAP ────────────────────────────────────────────────

const checkForNewEmails = async (tenantId, tenant, connection) => {
    try {
        if (!connection) return;

        const searchPromise = connection.search(['UNSEEN'], {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: false,
            struct: true,
        });
        const messages = await Promise.race([
            searchPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('search timeout')), 15000)),
        ]);

        if (messages.length === 0) return;

        console.log(`[${tenantId}] ${messages.length} מיילים חדשים`);

        for (const item of messages) {
            const uid = item.attributes.uid;
            if (processingEmails.has(`${tenantId}:${uid}`)) continue;
            processingEmails.add(`${tenantId}:${uid}`);

            const all = item.parts.find(p => p.which === '');
            const parsed = await simpleParser(`Imap-Id: ${uid}\r\n` + all.body);

            const fromEmail = parsed.from?.value?.[0]?.address || '';
            const subject   = parsed.subject || '';
            let shouldMarkSeen = false;

            if (fromEmail.toLowerCase() === tenant.destinationEmail.toLowerCase() && subject.includes('WA_MSG:')) {
                if (!isConnected(tenantId)) {
                    console.warn(`[${tenantId}] וואצאפ לא מחובר — ננסה שוב`);
                    processingEmails.delete(`${tenantId}:${uid}`);
                    continue;
                }

                const match = subject.match(/WA_MSG:\s*([0-9\-\+]+)/);
                if (match) {
                    const phone = match[1].trim().replace(/\D/g, '');
                    const jid   = `${phone}@s.whatsapp.net`;

                    const doSend = async () => {
                        const body = cleanEmailBody(parsed.text);
                        if (body) {
                            await sendMessage(tenantId, jid, { text: body });
                            await Message.create({ tenantId, phone, senderName: 'אני', direction: 'out', text: body });
                        }
                        if (parsed.attachments?.length) {
                            for (const att of parsed.attachments) {
                                let content = {};
                                if (att.contentType.startsWith('image/'))      content = { image: att.content, caption: att.filename };
                                else if (att.contentType.startsWith('video/')) content = { video: att.content, caption: att.filename };
                                else if (att.contentType.startsWith('audio/')) content = { audio: att.content, mimetype: 'audio/mp4', ptt: true };
                                else                                           content = { document: att.content, mimetype: att.contentType, fileName: att.filename };
                                await sendMessage(tenantId, jid, content);
                            }
                        }
                        console.log(`[${tenantId}] ✓ uid=${uid} → ${phone}`);
                        const bridge = bridges.get(tenantId);
                        if (bridge) { bridge.stats.emailToWa++; bridge.stats.lastEmailAt = new Date().toISOString(); }
                    };

                    if (isConnected(tenantId)) {
                        try {
                            await doSend();
                            shouldMarkSeen = true;
                        } catch (waErr) {
                            console.error(`[${tenantId}] שגיאת וואצאפ:`, waErr.message);
                            processingEmails.delete(`${tenantId}:${uid}`);
                        }
                    } else if (_queueSend) {
                        // WA ישן — מעביר לקונבייר עם עדיפות
                        _queueSend(tenantId, doSend);
                        shouldMarkSeen = true;
                    } else {
                        processingEmails.delete(`${tenantId}:${uid}`);
                    }
                } else {
                    shouldMarkSeen = true;
                }
            } else {
                shouldMarkSeen = true;
            }

            if (shouldMarkSeen) {
                await connection.addFlags(uid, ['\\Seen']);
                processingEmails.delete(`${tenantId}:${uid}`);
            }
        }
    } catch (err) {
        console.error(`[${tenantId}] שגיאת פולינג:`, err.message);
        if (err.message.includes('Socket') || err.message.includes('Ended')) {
            clearInterval(bridges.get(tenantId)?.emailInterval);
            setTimeout(() => startBridge(tenantId, tenant), 5000);
        }
    }
};

// ─── מחזור חיים של הגשר ─────────────────────────────────────────

export const startBridge = async (tenantId, tenant) => {
    stopBridge(tenantId);

    if (!tenant.bridgeEmail || !tenant.bridgeEmailPassword || !tenant.destinationEmail) return;

    let connection;
    try {
        console.log(`[${tenantId}] מתחבר ל-IMAP...`);
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
        console.error(`[${tenantId}] IMAP חיבור נכשל:`, err.message, '— ניסיון חוזר בעוד 30ש׳');
        setTimeout(() => startBridge(tenantId, tenant), 30000);
        return;
    }

    const stats = {
        active: true,
        emailToWa: 0,
        waToEmail: 0,
        lastEmailAt: null,
        connectedAt: new Date().toISOString(),
        reconnectCount: (bridges.get(tenantId)?.stats?.reconnectCount ?? 0) + 1,
    };

    await checkForNewEmails(tenantId, tenant, connection);
    const emailInterval = setInterval(() => checkForNewEmails(tenantId, tenant, connection), 10000);

    const healthInterval = setInterval(() => {
        try {
            if (!connection || connection.imap.state === 'disconnected') {
                console.warn(`[${tenantId}] IMAP health: מת — מתחבר מחדש`);
                clearInterval(emailInterval);
                clearInterval(healthInterval);
                bridges.delete(tenantId);
                connection = null;
                setTimeout(() => startBridge(tenantId, tenant), 1000);
            }
        } catch (e) {}
    }, 5 * 60 * 1000);

    connection.on('error', (err) => {
        console.error(`[${tenantId}] IMAP שגיאה:`, err.message);
        clearInterval(emailInterval);
        setTimeout(() => startBridge(tenantId, tenant), 10000);
    });

    bridges.set(tenantId, { connection, emailInterval, healthInterval, stats });
};

export const stopBridge = (tenantId) => {
    const bridge = bridges.get(tenantId);
    if (!bridge) return;
    clearInterval(bridge.emailInterval);
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

// ─── בדיקת חיבור IMAP חד-פעמית ─────────────────────────────────

export const testImapConnection = async (email, password) => {
    let connection;
    const attempt = new Promise(async (resolve) => {
        try {
            connection = await imap.connect({
                imap: { user: email, password, host: 'imap.gmail.com', port: 993,
                        tls: true, authTimeout: 10000, tlsOptions: { rejectUnauthorized: false } },
            });
            await connection.openBox('INBOX');
            resolve({ ok: true });
        } catch (err) {
            const msg = err.message || '';
            if (msg.toLowerCase().includes('invalid credentials') || msg.toLowerCase().includes('authentication failed'))
                resolve({ ok: false, error: 'סיסמת האפ שגויה או שגישת IMAP לא מופעלת בחשבון' });
            else if (msg.toLowerCase().includes('timeout'))
                resolve({ ok: false, error: 'תם הזמן — בדוק שגישת IMAP מופעלת בחשבון Gmail' });
            else
                resolve({ ok: false, error: `שגיאת חיבור: ${msg}` });
        } finally {
            try { connection?.end?.(); } catch (e) {}
        }
    });
    const timeout = new Promise(resolve =>
        setTimeout(() => resolve({ ok: false, error: 'תם הזמן (20 שניות)' }), 20000)
    );
    return Promise.race([attempt, timeout]);
};
