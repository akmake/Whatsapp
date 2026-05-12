import imap from 'imap-simple';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { isConnected, sendMessage } from './whatsappManager.js';

// tenantId => { connection, emailInterval, healthInterval, stats, processingEmails }
const bridges = new Map();

const POLL_INTERVAL    = 10_000;       // 10 שניות — שומר את החיבור חי
const HEALTH_INTERVAL  = 5 * 60_000;  // 5 דקות — בדיקת חיבור
const RECONNECT_DELAY  = 30_000;      // 30 שניות בין reconnects

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
        port: 587,
        secure: false,
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
const checkForNewEmails = async (tenantId, tenant, connection) => {
    try {
        if (!connection) return;

        const messages = await connection.search(['UNSEEN'], {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: false,
            struct: true,
        });

        if (messages.length === 0) return;

        const bridge = bridges.get(tenantId);
        if (!bridge) return;

        console.log(`[${tenantId}] פולינג — ${messages.length} מיילים חדשים`);

        for (const item of messages) {
            const uid = item.attributes.uid;
            if (bridge.processingEmails.has(uid)) continue;
            bridge.processingEmails.add(uid);

            try {
                const all = item.parts.find(p => p.which === '');
                const parsed = await simpleParser(`Imap-Id: ${uid}\r\n` + all.body);

                const fromEmail = parsed.from?.value?.[0]?.address || '';
                const subject   = parsed.subject || '';

                console.log(`[${tenantId}] מייל uid=${uid} מ: ${fromEmail} | נושא: ${subject}`);

                if (fromEmail.toLowerCase() !== tenant.destinationEmail.toLowerCase()) {
                    console.log(`[${tenantId}] uid=${uid} דחוי — שולח !== ייעד`);
                    await connection.addFlags(uid, ['\\Seen']);
                    bridge.processingEmails.delete(uid);
                    continue;
                }

                if (!subject.includes('WA_MSG:')) {
                    console.log(`[${tenantId}] uid=${uid} דחוי — נושא לא מכיל WA_MSG:`);
                    await connection.addFlags(uid, ['\\Seen']);
                    bridge.processingEmails.delete(uid);
                    continue;
                }

                const match = subject.match(/WA_MSG:\s*([0-9\-\+]+)/);
                if (!match) {
                    console.log(`[${tenantId}] uid=${uid} דחוי — לא נמצא מספר`);
                    await connection.addFlags(uid, ['\\Seen']);
                    bridge.processingEmails.delete(uid);
                    continue;
                }

                const phone = match[1].trim().replace(/\D/g, '');
                const jid   = `${phone}@s.whatsapp.net`;

                if (!isConnected(tenantId)) {
                    console.warn(`[${tenantId}] וואצאפ לא מחובר — ננסה שוב`);
                    bridge.processingEmails.delete(uid);
                    continue;
                }

                const body = cleanEmailBody(parsed.text);
                if (body) {
                    await sendMessage(tenantId, jid, { text: body });
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

                await connection.addFlags(uid, ['\\Seen']);
                bridge.stats.emailToWa++;
                bridge.stats.lastEmailAt = new Date().toISOString();
                bridge.processingEmails.delete(uid);
                console.log(`[${tenantId}] uid=${uid} ✓ תשובה נשלחה לוואצאפ → ${phone}`);

            } catch (err) {
                console.error(`[${tenantId}] שגיאה בטיפול במייל uid=${uid}:`, err.message);
                bridge.processingEmails?.delete(uid);
            }
        }
    } catch (err) {
        console.error(`[${tenantId}] שגיאת פולינג:`, err.message);
        if (err.message.includes('Socket') || err.message.includes('Ended') || err.message.includes('closed')) {
            stopBridge(tenantId);
            setTimeout(() => startBridge(tenantId, tenant), RECONNECT_DELAY);
        }
    }
};

// ============================================================
// התחלה / עצירה
// ============================================================
export const startBridge = async (tenantId, tenant) => {
    stopBridge(tenantId); // מנקים קודם אם יש

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
        console.error(`[${tenantId}] IMAP חיבור נכשל:`, err.message, `— ניסיון חוזר בעוד ${RECONNECT_DELAY / 1000}ש׳`);
        setTimeout(() => startBridge(tenantId, tenant), RECONNECT_DELAY);
        return;
    }

    const bridge = {
        connection,
        processingEmails: new Set(),
        emailInterval: null,
        healthInterval: null,
        stats: {
            active: true,
            emailToWa: 0,
            waToEmail: 0,
            lastEmailAt: null,
            connectedAt: new Date().toISOString(),
            reconnectCount: (bridges.get(tenantId)?.stats?.reconnectCount ?? 0) + 1,
        },
    };
    bridges.set(tenantId, bridge);

    // פולינג כל 10 שניות — שומר את החיבור חי
    bridge.emailInterval = setInterval(() => checkForNewEmails(tenantId, tenant, connection), POLL_INTERVAL);

    // health check כל 5 דקות
    bridge.healthInterval = setInterval(() => {
        try {
            if (!connection || connection.imap.state === 'disconnected') {
                console.warn(`[${tenantId}] IMAP health: חיבור מת — מתחבר מחדש`);
                clearInterval(bridge.emailInterval);
                clearInterval(bridge.healthInterval);
                bridges.delete(tenantId);
                connection = null;
                setTimeout(() => startBridge(tenantId, tenant), 1000);
            }
        } catch (e) {}
    }, HEALTH_INTERVAL);

    connection.on('error', (err) => {
        console.error(`[${tenantId}] IMAP שגיאה:`, err.message);
        stopBridge(tenantId);
        setTimeout(() => startBridge(tenantId, tenant), RECONNECT_DELAY);
    });
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

// ============================================================
// בדיקת חיבור IMAP חד-פעמית
// ============================================================
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
