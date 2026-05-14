import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import Tenant from '../models/Tenant.js';
import Message from '../models/Message.js';
import { extractPhone } from './whatsappManager.js';
import { getMessageText, getMessageType, downloadMedia } from './waMessageUtils.js';
import { sendEmailToTenant, recordWaToEmail } from './emailBridgeManager.js';
import { broadcast } from './sseManager.js';

const MEDIA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

export const handleIncomingWAMessage = async (tenantId, msg, sock) => {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant || !tenant.active) return;

    const fromPhone = extractPhone(msg, tenantId);
    if (!fromPhone) return;

    const senderName = msg.pushName || fromPhone;
    const text = getMessageText(msg);
    const msgType = getMessageType(msg);

    let attachments = [];
    let extraText = '';
    let mediaPath = null;

    if (msgType === 'imageMessage') {
        try {
            const buffer = await downloadMedia(msg, sock);
            const token = randomBytes(6).toString('hex');
            const filename = `img_${Date.now()}_${token}.jpg`;
            const dir = path.join(MEDIA_DIR, tenantId);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            mediaPath = path.join(dir, filename);
            fs.writeFileSync(mediaPath, buffer);
            if (!text) extraText = '📷 תמונה';
        } catch (err) {
            console.error(`[${tenantId}] שגיאת הורדת תמונה:`, err.message);
            extraText = '📷 תמונה';
        }
    }

    if (msgType === 'videoMessage') {
        try {
            const buffer = await downloadMedia(msg, sock);
            const filename = `video_${Date.now()}.mp4`;
            attachments.push({ filename, content: buffer });
            extraText = `🎥 ${filename}`;
        } catch (err) {
            console.error(`[${tenantId}] שגיאת הורדת סרטון:`, err.message);
            extraText = '🎥 סרטון';
        }
    }

    if (msgType === 'audioMessage') {
        try {
            const buffer = await downloadMedia(msg, sock);
            const filename = `voice_${Date.now()}.ogg`;
            attachments.push({ filename, content: buffer });
            extraText = '🎵 הקלטה קולית';
        } catch (err) {
            console.error(`[${tenantId}] שגיאת הורדת אודיו:`, err.message);
            extraText = '🎵 הקלטה קולית';
        }
    }

    if (msgType === 'documentMessage') {
        try {
            const buffer = await downloadMedia(msg, sock);
            const filename = msg.message.documentMessage?.fileName || `doc_${Date.now()}.pdf`;
            const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
            attachments.push({ filename, content: buffer });
            extraText = `📄 ${filename}||${sizeMB}MB`;
        } catch (err) {
            console.error(`[${tenantId}] שגיאת הורדת מסמך:`, err.message);
            extraText = '📄 קובץ||';
        }
    }

    if (msgType === 'contactMessage') {
        const vcard = msg.message.contactMessage.vcard;
        const name = msg.message.contactMessage.displayName || '';
        const phone = (vcard.match(/TEL[^:]*:([^\r\n]+)/) || [])[1]?.trim() || '';
        extraText = `📇 איש קשר: ${name}${phone ? `\n📞 ${phone}` : ''}`;
    }

    if (msgType === 'contactsArrayMessage') {
        const contacts = msg.message.contactsArrayMessage.contacts || [];
        extraText = contacts.map(c => {
            const name = c.displayName || '';
            const phone = (c.vcard?.match(/TEL[^:]*:([^\r\n]+)/) || [])[1]?.trim() || '';
            return `📇 איש קשר: ${name}${phone ? `\n📞 ${phone}` : ''}`;
        }).join('\n\n');
    }

    const finalText = [text, extraText].filter(Boolean).join('\n');
    if (!finalText && attachments.length === 0 && !mediaPath) return;

    await Message.create({
        tenantId, phone: fromPhone, senderName, direction: 'in',
        text: finalText || '📷 תמונה',
        mediaPath,
    });

    await sendEmailToTenant(tenant, tenantId, fromPhone, senderName, finalText, attachments);
    recordWaToEmail(tenantId);
    broadcast('message');
    console.log(`[${tenantId}] הודעה מ-${fromPhone} הועברה למייל`);
};
