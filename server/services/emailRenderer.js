import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import Message from '../models/Message.js';
import { decrypt } from '../utils/crypto.js';

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:5002';

// ─── SMTP transporter cache ─────────────────────────────────────

const transporterCache = new Map();

export const invalidateTransporter = (tenantId) => {
    const t = transporterCache.get(tenantId);
    if (t) { try { t.close(); } catch (e) {} }
    transporterCache.delete(tenantId);
};

const getTransporter = (tenant) => {
    const id = tenant._id.toString();
    if (!transporterCache.has(id)) {
        transporterCache.set(id, nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: { user: tenant.bridgeEmail, pass: decrypt(tenant.bridgeEmailPassword) },
            pool: true,
            maxConnections: 3,
        }));
    }
    return transporterCache.get(id);
};

// ─── ניקוי גוף מייל ─────────────────────────────────────────────

export const cleanEmailBody = (text) => {
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

// ─── בניית בועת מדיה ────────────────────────────────────────────

const escapeHtml = (s) =>
    (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

const mediaBlock = (mediaType, url, label) => {
    if (mediaType === 'image') {
        // עוטפים בקישור — לחיצה פותחת תמונה מלאה בטאב חדש
        return `<a href="${url}" target="_blank" style="display:block;"><img src="${url}" style="max-width:260px;width:100%;border-radius:6px;display:block;cursor:pointer;"></a>`;
    }

    const icons = { video: '🎥', audio: '🎵', document: '📄' };
    const icon  = icons[mediaType] || '📎';
    const btn   = mediaType === 'audio'    ? '#1a73e8'
                : mediaType === 'video'    ? '#1a73e8'
                : /* document */             '#1a73e8';

    return `
        <a href="${url}" target="_blank" style="
            display:inline-flex;align-items:center;gap:8px;
            background:${btn};color:#fff;text-decoration:none;
            padding:9px 16px;border-radius:8px;font-size:13px;font-weight:bold;
            direction:rtl;margin:2px 0;max-width:240px;word-break:break-word;
        ">
            <span style="font-size:16px;line-height:1;">${icon}</span>
            <span>${escapeHtml(label)}</span>
        </a>`;
};

const renderBubble = (msg, isNew, tenantId) => {
    const isIn = msg.direction === 'in';
    const time = new Date(msg.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const bubbleBg  = isIn ? '#ffffff' : '#dcf8c6';
    const borderRad = isIn ? '8px 0px 8px 8px' : '0px 8px 8px 8px';
    const align     = isIn ? 'right' : 'left';
    const tdL       = isIn  ? '<td width="15%"></td>' : '';
    const tdR       = !isIn ? '<td width="15%"></td>' : '';
    const checks    = isIn  ? '' : '<span style="font-size:12px;color:#53bdeb;margin-right:3px;">✓✓</span>';

    let contentHtml;
    if (msg.mediaPath && msg.mediaType) {
        const filename = path.basename(msg.mediaPath);
        const url      = `${PUBLIC_URL}/api/media/${tenantId}/${filename}`;
        const label    = msg.text && !['📷 תמונה','🎥 סרטון','🎵 הקלטה קולית'].includes(msg.text)
                         ? msg.text
                         : filename;
        const block = mediaBlock(msg.mediaType, url, label);
        const caption = (msg.text && msg.mediaType !== 'image')
            ? `<div style="font-size:12px;color:#666;margin-top:4px;direction:rtl;">${escapeHtml(msg.text)}</div>`
            : '';
        contentHtml = block + caption;
    } else {
        contentHtml = `<div style="font-size:13px;color:#111;line-height:1.5;direction:rtl;">${escapeHtml(msg.text)}</div>`;
    }

    return `
    <tr><td style="padding:3px 0;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        ${tdL}
        <td width="85%" align="${align}">
          ${isNew ? '<div style="text-align:center;margin-bottom:6px;"><span style="background:#e1f3fb;color:#075e54;font-size:11px;padding:3px 10px;border-radius:8px;font-weight:bold;">▼ הודעה חדשה</span></div>' : ''}
          <div style="display:inline-block;background:${bubbleBg};border-radius:${borderRad};padding:8px 12px;max-width:100%;text-align:right;direction:rtl;box-shadow:0 1px 2px rgba(0,0,0,0.12);">
            ${contentHtml}
            <div style="text-align:left;margin-top:4px;">${checks}<span style="font-size:10px;color:#999;">${time}</span></div>
          </div>
        </td>
        ${tdR}
      </tr></table>
    </td></tr>`;
};

// ─── שליחת מייל ─────────────────────────────────────────────────

export const sendEmailToTenant = async (tenant, tenantId, fromPhone, senderName, textContent) => {
    const transporter = getTransporter(tenant);

    const subject   = `WA_MSG: ${fromPhone}`;
    const threadId  = `<wa-thread-${tenant._id}-${fromPhone}@bridge>`;
    const messageId = `<wa-${tenant._id}-${fromPhone}-${Date.now()}@bridge>`;

    const now = new Date();
    const dateStr = now.toLocaleDateString('he-IL');

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const history = await Message.find({
        tenantId: tenant._id.toString(),
        phone: fromPhone,
        createdAt: { $gte: startOfDay },
    }).sort({ createdAt: 1 }).lean();

    const bubblesHtml = history.map((m, i) =>
        renderBubble(m, i === history.length - 1 && m.direction === 'in', tenantId)
    ).join('');

    // הקובץ האחרון מצורף ממש לאימייל — שאר ההיסטוריה רק קישורים
    const attachments = [];
    const newestMsg = history.length ? history[history.length - 1] : null;
    if (newestMsg?.mediaPath && newestMsg.direction === 'in') {
        try {
            const buf = fs.readFileSync(newestMsg.mediaPath);
            attachments.push({ filename: path.basename(newestMsg.mediaPath), content: buf });
        } catch (e) { /* קובץ נמחק — ממשיכים ללא צירוף */ }
    }

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:16px 0;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;">
      <tr><td style="background:#25d366;border-radius:12px 12px 0 0;padding:10px 18px;text-align:center;">
        <div style="color:#fff;font-size:14px;font-weight:bold;">↩ לחץ Reply וכתוב את תשובתך</div>
      </td></tr>
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
      <tr><td style="background:#e5ddd5;padding:12px 10px;">
        <table width="100%" cellpadding="0" cellspacing="0">${bubblesHtml}</table>
      </td></tr>
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
        attachments,
    });
};
