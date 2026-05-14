import imap from 'imap-simple';
import { simpleParser } from 'mailparser';
import { isConnected, sendMessage } from './whatsappManager.js';
import { cleanEmailBody, sendEmailToTenant } from './emailRenderer.js';
import Message from '../models/Message.js';
import { decrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

export { sendEmailToTenant } from './emailRenderer.js';

let _queueSend = null;
export const registerQueueSend = (fn) => { _queueSend = fn; };

// tenantId → { connection, emailInterval, healthInterval, stats, isPolling, errorStreak }
const bridges = new Map();

const processingEmails = new Set();

const withTimeout = (promise, ms, label) =>
    Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`timeout:${label}`)), ms)
        ),
    ]);

// ─── פולינג IMAP ────────────────────────────────────────────────

const checkForNewEmails = async (tenantId, tenant, bridge) => {
    // mutex: אם פולינג קודם עדיין רץ — מדלגים
    if (bridge.isPolling) return;
    bridge.isPolling = true;

    try {
        const { connection } = bridge;
        if (!connection) return;

        let messages;
        try {
            messages = await withTimeout(
                connection.search(['UNSEEN'], {
                    bodies: ['HEADER', 'TEXT', ''],
                    markSeen: false,
                    struct: true,
                }),
                15000, 'imap-search'
            );
        } catch (searchErr) {
            bridge.errorStreak = (bridge.errorStreak || 0) + 1;
            console.error(`[${tenantId}] שגיאת פולינג (streak=${bridge.errorStreak}):`, searchErr.message);
            logger.error('imap', `poll error streak=${bridge.errorStreak}: ${searchErr.message}`, { tenantId });
            scheduleRestart(tenantId, tenant, bridge);
            return;
        }

        // איפוס errorStreak על הצלחה
        bridge.errorStreak = 0;
        if (messages.length === 0) return;

        console.log(`[${tenantId}] ${messages.length} מיילים חדשים`);

        for (const item of messages) {
            const uid = item.attributes.uid;
            if (processingEmails.has(`${tenantId}:${uid}`)) continue;
            processingEmails.add(`${tenantId}:${uid}`);

            let parsed;
            try {
                const all = item.parts.find(p => p.which === '');
                parsed = await simpleParser(`Imap-Id: ${uid}\r\n` + all.body);
            } catch (parseErr) {
                console.error(`[${tenantId}] שגיאת parse uid=${uid}:`, parseErr.message);
                processingEmails.delete(`${tenantId}:${uid}`);
                continue;
            }

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
                        const b = bridges.get(tenantId);
                        if (b) { b.stats.emailToWa++; b.stats.lastEmailAt = new Date().toISOString(); }
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
                try {
                    // timeout על addFlags כדי שלא יתקע לנצח
                    await withTimeout(connection.addFlags(uid, ['\\Seen']), 8000, 'imap-addFlags');
                } catch (flagErr) {
                    console.error(`[${tenantId}] addFlags נכשל uid=${uid}:`, flagErr.message);
                    scheduleRestart(tenantId, tenant, bridge);
                }
                processingEmails.delete(`${tenantId}:${uid}`);
            }
        }
    } finally {
        bridge.isPolling = false;
    }
};

// ─── restart מבוקר עם cooldown ──────────────────────────────────

const restartTimers = new Map();

const scheduleRestart = (tenantId, tenant, bridge) => {
    if (restartTimers.has(tenantId)) return; // cooldown — כבר ממתין
    clearInterval(bridge.emailInterval);
    clearInterval(bridge.healthInterval);
    bridge.emailInterval = null;
    bridge.healthInterval = null;
    const delay = Math.min(5000 * Math.pow(2, bridge.errorStreak || 0), 60000);
    console.warn(`[${tenantId}] IMAP restart בעוד ${delay / 1000}ש׳`);
    restartTimers.set(tenantId, setTimeout(() => {
        restartTimers.delete(tenantId);
        startBridge(tenantId, tenant);
    }, delay));
};

// ─── מחזור חיי הגשר ─────────────────────────────────────────────

export const startBridge = async (tenantId, tenant) => {
    stopBridge(tenantId);
    clearTimeout(restartTimers.get(tenantId));
    restartTimers.delete(tenantId);

    if (!tenant.bridgeEmail || !tenant.bridgeEmailPassword || !tenant.destinationEmail) return;

    let connection;
    try {
        console.log(`[${tenantId}] מתחבר ל-IMAP...`);
        connection = await withTimeout(
            imap.connect({
                imap: {
                    user: tenant.bridgeEmail,
                    password: decrypt(tenant.bridgeEmailPassword),
                    host: 'imap.gmail.com',
                    port: 993,
                    tls: true,
                    authTimeout: 30000,
                    tlsOptions: { rejectUnauthorized: false },
                },
            }),
            35000, 'imap-connect'
        );
        await withTimeout(connection.openBox('INBOX'), 10000, 'imap-openBox');
        console.log(`[${tenantId}] IMAP מחובר`);
    logger.info('imap', 'connected', { tenantId, reconnectCount: (bridges.get(tenantId)?.stats?.reconnectCount ?? 0) + 1 });
    } catch (err) {
        console.error(`[${tenantId}] IMAP חיבור נכשל:`, err.message, '— ניסיון חוזר בעוד 30ש׳');
        logger.error('imap', `connection failed: ${err.message}`, { tenantId });
        setTimeout(() => startBridge(tenantId, tenant), 30000);
        return;
    }

    const prevStats = bridges.get(tenantId)?.stats;
    const stats = {
        active: true,
        emailToWa: prevStats?.emailToWa ?? 0,
        waToEmail: prevStats?.waToEmail ?? 0,
        lastEmailAt: prevStats?.lastEmailAt ?? null,
        connectedAt: new Date().toISOString(),
        reconnectCount: (prevStats?.reconnectCount ?? 0) + 1,
    };

    const bridge = {
        connection,
        emailInterval: null,
        healthInterval: null,
        stats,
        isPolling: false,
        errorStreak: 0,
    };
    bridges.set(tenantId, bridge);

    // פולינג ראשוני מיידי
    await checkForNewEmails(tenantId, tenant, bridge);

    // guard: startBridge אחר עשוי להחליף את הגשר בזמן ה-await
    if (bridges.get(tenantId) !== bridge) return;

    bridge.emailInterval = setInterval(() => {
        const b = bridges.get(tenantId);
        if (b !== bridge) { clearInterval(bridge.emailInterval); return; }
        checkForNewEmails(tenantId, tenant, b);
    }, 10000);

    bridge.healthInterval = setInterval(() => {
        const b = bridges.get(tenantId);
        if (b !== bridge) { clearInterval(bridge.healthInterval); return; }
        try {
            if (!connection || connection.imap.state === 'disconnected') {
                console.warn(`[${tenantId}] IMAP health: מת — מתחבר מחדש`);
                scheduleRestart(tenantId, tenant, b);
            }
        } catch (e) {}
    }, 5 * 60 * 1000);

    connection.on('error', (err) => {
        console.error(`[${tenantId}] IMAP שגיאה:`, err.message);
        const b = bridges.get(tenantId);
        if (b === bridge) scheduleRestart(tenantId, tenant, b);
    });
};

export const stopBridge = (tenantId) => {
    const bridge = bridges.get(tenantId);
    if (!bridge) return;
    clearInterval(bridge.emailInterval);
    clearInterval(bridge.healthInterval);
    bridge.emailInterval = null;
    bridge.healthInterval = null;
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
