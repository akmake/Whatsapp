import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import Message from '../models/Message.js';

// ─── ניקוי גוף מייל — חיתוך ציטוטים וחתימות ───────────────────

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

// ─── בניית HTML ─────────────────────────────────────────────────

const escapeHtml = (s) =>
    (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

const renderBubble = (msg, isNew = false, imageCid = null) => {
    const isIn = msg.direction === 'in';
    const time = new Date(msg.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const bubbleBg   = isIn ? '#dcf8c6' : '#ffffff';
    const borderRad  = isIn ? '8px 0px 8px 8px' : '0px 8px 8px 8px';
    const align      = isIn ? 'right' : 'left';
    const tdEmpty    = isIn ? '<td width="15%"></td>' : '';
    const tdEmptyEnd = !isIn ? '<td width="15%"></td>' : '';
    const checks     = isIn ? '' : '<span style="font-size:12px;color:#53bdeb;margin-right:3px;">✓✓</span>';

    let contentHtml;
    if (imageCid) {
        const caption = (msg.text && msg.text !== '📷 תמונה')
            ? `<div style="font-size:13px;color:#111;margin-top:6px;direction:rtl;">${escapeHtml(msg.text)}</div>`
            : '';
        contentHtml = `<img src="cid:${imageCid}" style="max-width:260px;width:100%;border-radius:6px;display:block;">${caption}`;
    } else {
        contentHtml = `<div style="font-size:13px;color:#111;line-height:1.5;direction:rtl;">${escapeHtml(msg.text)}</div>`;
    }

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

// ─── שליחת מייל ─────────────────────────────────────────────────

export const sendEmailToTenant = async (tenant, fromPhone, senderName, textContent, attachments = [], inlineImageData = null) => {
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: { user: tenant.bridgeEmail, pass: tenant.bridgeEmailPassword },
    });

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

    const cidMap = new Map();
    const extraAttachments = [];
    for (const m of history) {
        if (m.mediaPath) {
            try {
                const buf = fs.readFileSync(m.mediaPath);
                const cid = `img-${m._id}@bridge`;
                cidMap.set(m._id.toString(), cid);
                extraAttachments.push({ filename: path.basename(m.mediaPath), content: buf, cid });
            } catch (e) { /* file missing — skip */ }
        }
    }
    const newMsgId = history.length ? history[history.length - 1]._id.toString() : null;
    if (inlineImageData && newMsgId && !cidMap.has(newMsgId)) {
        const cid = `img-${Date.now()}@bridge`;
        cidMap.set(newMsgId, cid);
        extraAttachments.push({ filename: inlineImageData.filename, content: inlineImageData.buffer, cid });
    }

    const bubblesHtml = history.map((m, i) => {
        const isNewMsg = i === history.length - 1 && m.direction === 'in';
        return renderBubble(m, isNewMsg, cidMap.get(m._id.toString()) || null);
    }).join('');

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
        attachments: [
            ...attachments.map(a => ({ filename: a.filename, content: a.content })),
            ...extraAttachments,
        ],
    });
};
