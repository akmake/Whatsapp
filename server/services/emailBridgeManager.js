import imap from 'imap-simple';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { isConnected, sendMessage } from './whatsappManager.js';
import Message from '../models/Message.js';

// tenantId => { connection, emailInterval, healthInterval, stats }
const bridges = new Map();

const processingEmails = new Set(); // מונע עיבוד כפול

// ============================================================
// ניקוי גוף מייל — זהה ל-sterni
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
const escapeHtml = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

const renderBubble = (msg, isNew = false) => {
    const isIn = msg.direction === 'in';
    const time = new Date(msg.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const bubbleBg   = isIn  ? '#dcf8c6' : '#ffffff';
    const borderRad  = isIn  ? '8px 0px 8px 8px' : '0px 8px 8px 8px';
    const align      = isIn  ? 'right' : 'left';
    const tdEmpty    = isIn  ? '<td width="15%"></td>' : '';
    const tdEmptyEnd = !isIn ? '<td width="15%"></td>' : '';
    const checks     = isIn  ? '' : '<span style="font-size:12px;color:#53bdeb;margin-right:3px;">✓✓</span>';

    const isInlineImage = msg.text?.startsWith('__IMAGE__');
    const cid = isInlineImage ? msg.text.replace('__IMAGE__', '') : null;
    const contentHtml = isInlineImage
        ? `<img src="cid:${cid}" style="max-width:240px;border-radius:6px;display:block;">`
        : `<div style="font-size:13px;color:#111;line-height:1.5;">${escapeHtml(msg.text)}</div>`;

    return `
    <tr><td style="padding:3px 0;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        ${tdEmpty}
        <td width="85%" align="${align}">
          ${isNew ? '<div style="text-align:center;margin-bottom:6px;"><span style="background:#e1f3fb;color:#075e54;font-size:11px;padding:3px 10px;border-radius:8px;font-weight:bold;">▼ הודעה חדשה</span></div>' : ''}
          <div style="display:inline-block;background:${bubbleBg};border-radius:${borderRad};padding:8px 12px;max-width:100%;text-align:right;direction:rtl;box-shadow:0 1px 2px rgba(0,0,0,0.12);">
            ${contentHtml}
            <div style="text-align:left;margin-top:4px;">${checks}<span style="font-size:10px;color:#999;">${time}</span></div>
          </div>
        </td>
        ${tdEmptyEnd}
      </tr></table>
    </td></tr>`;
};

export const sendEmailToTenant = async (tenant, fromPhone, senderName, textContent, attachments = []) => {
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: { user: tenant.bridgeEmail, pass: tenant.bridgeEmailPassword },
    });

    const subject = `WA_MSG: ${fromPhone}`;
    const threadId = `<wa-thread-${tenant._id}-${fromPhone}@bridge>`;
    const messageId = `<wa-${tenant._id}-${fromPhone}-${Date.now()}@bridge>`;

    const now = new Date();
    const dateStr = now.toLocaleDateString('he-IL');

    // Fetch today's history (all except the new message just saved)
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const history = await Message.find({
        tenantId: tenant._id.toString(),
        phone: fromPhone,
        createdAt: { $gte: startOfDay },
    }).sort({ createdAt: 1 }).lean();

    // Last message is the one we just saved (direction:'in') — mark it as new
    const bubblesHtml = history.map((m, i) =>
        renderBubble(m, i === history.length - 1 && m.direction === 'in')
    ).join('');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:16px 0;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;">

      <!-- Reply CTA -->
      <tr><td style="background:#25d366;border-radius:12px 12px 0 0;padding:10px 18px;text-align:center;">
        <div style="color:#fff;font-size:14px;font-weight:bold;">↩ לחץ Reply וכתוב את תשובתך</div>
      </td></tr>

      <!-- Header -->
      <tr><td style="background:#075e54;padding:12px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="width:44px;vertical-align:middle;">
            <div style="width:40px;height:40px;border-radius:50%;background:#25d366;text-align:center;line-height:40px;font-size:18px;color:#fff;font-weight:bold;">
              ${(senderName || fromPhone).charAt(0).toUpperCase()}
            </div>
          </td>
          <td style="padding-right:10px;vertical-align:middle;">
            <div style="color:#fff;font-size:15px;font-weight:bold;direction:rtl;">${escapeHtml(senderName)}</div>
            <div style="color:#b2dfdb;font-size:12px;">+${fromPhone}</div>
          </td>
          <td align="left" style="vertical-align:middle;">
            <div style="color:#b2dfdb;font-size:11px;">${dateStr}</div>
          </td>
        </tr></table>
      </td></tr>

      <!-- Chat bubbles -->
      <tr><td style="background:#e5ddd5;padding:12px 10px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${bubblesHtml}
        </table>
      </td></tr>

      <!-- Separator -->
      <tr><td style="background:#f7f7f7;border-top:1px solid #e0e0e0;border-radius:0 0 12px 12px;padding:8px 18px;">
        <div style="border-top:2px dashed #ddd;margin:4px 0;"></div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

    await transporter.sendMail({
        from: `${senderName} via WhatsApp <${tenant.bridgeEmail}>`,
        to: tenant.destinationEmail,
        subject,
        html,
        messageId,
        inReplyTo: threadId,
        references: threadId,
        attachments: attachments.map(a => ({
            filename: a.filename,
            content:  a.content,
            ...(a.cid ? { cid: a.cid } : {}),
        })),
    });
};

// ============================================================
// פולינג — זהה ל-sterni checkForNewEmails
// ============================================================
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

                    try {
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
                        shouldMarkSeen = true;

                    } catch (waErr) {
                        console.error(`[${tenantId}] שגיאת וואצאפ:`, waErr.message);
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

// ============================================================
// התחלה / עצירה — זהה ל-sterni startEmailListener
// ============================================================
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

    // בדיקה מיידית + פולינג כל 10 שניות — בדיוק כמו sterni
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

// ============================================================
// בדיקת חיבור IMAP חד-פעמית
// ============================================================
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
