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

const token = () => randomBytes(6).toString('hex');

const saveMedia = (tenantId, filename, buffer) => {
    const dir = path.join(MEDIA_DIR, tenantId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);
    return filePath;
};

export const handleIncomingWAMessage = async (tenantId, msg, sock) => {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant || !tenant.active) return;

    const fromPhone = extractPhone(msg, tenantId);
    if (!fromPhone) return;

    const senderName = msg.pushName || fromPhone;
    const text = getMessageText(msg);
    const msgType = getMessageType(msg);

    let extraText = '';
    let mediaPath = null;
    let mediaType = null;

    if (msgType === 'imageMessage') {
        try {
            const buffer = await downloadMedia(msg, sock);
            mediaPath = saveMedia(tenantId, `img_${Date.now()}_${token()}.jpg`, buffer);
            mediaType = 'image';
            if (!text) extraText = '📷 תמונה';
        } catch (err) {
            console.error(`[${tenantId}] שגיאת הורדת תמונה:`, err.message);
            extraText = '📷 תמונה';
        }
    }

    if (msgType === 'videoMessage') {
        try {
            const buffer = await downloadMedia(msg, sock);
            const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
            mediaPath = saveMedia(tenantId, `vid_${Date.now()}_${token()}.mp4`, buffer);
            mediaType = 'video';
            extraText = `🎥 סרטון (${sizeMB}MB)`;
        } catch (err) {
            console.error(`[${tenantId}] שגיאת הורדת סרטון:`, err.message);
            extraText = '🎥 סרטון';
        }
    }

    if (msgType === 'audioMessage') {
        try {
            const buffer = await downloadMedia(msg, sock);
            mediaPath = saveMedia(tenantId, `aud_${Date.now()}_${token()}.ogg`, buffer);
            mediaType = 'audio';
            extraText = '🎵 הקלטה קולית';
        } catch (err) {
            console.error(`[${tenantId}] שגיאת הורדת אודיו:`, err.message);
            extraText = '🎵 הקלטה קולית';
        }
    }

    if (msgType === 'documentMessage') {
        try {
            const buffer = await downloadMedia(msg, sock);
            const origName = msg.message.documentMessage?.fileName || `doc_${Date.now()}`;
            const ext = path.extname(origName) || '.pdf';
            const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
            mediaPath = saveMedia(tenantId, `doc_${Date.now()}_${token()}${ext}`, buffer);
            mediaType = 'document';
            extraText = `📄 ${origName} (${sizeMB}MB)`;
        } catch (err) {
            console.error(`[${tenantId}] שגיאת הורדת מסמך:`, err.message);
            extraText = '📄 קובץ';
        }
    }

    if (msgType === 'contactMessage') {
        const vcard = msg.message.contactMessage.vcard;
        const name  = msg.message.contactMessage.displayName || '';
        const phone = (vcard.match(/TEL[^:]*:([^\r\n]+)/) || [])[1]?.trim() || '';
        extraText = `📇 איש קשר: ${name}${phone ? `\n📞 ${phone}` : ''}`;
    }

    if (msgType === 'contactsArrayMessage') {
        const contacts = msg.message.contactsArrayMessage.contacts || [];
        extraText = contacts.map(c => {
            const name  = c.displayName || '';
            const phone = (c.vcard?.match(/TEL[^:]*:([^\r\n]+)/) || [])[1]?.trim() || '';
            return `📇 איש קשר: ${name}${phone ? `\n📞 ${phone}` : ''}`;
        }).join('\n\n');
    }

    const finalText = [text, extraText].filter(Boolean).join('\n');
    if (!finalText && !mediaPath) return;

    await Message.create({
        tenantId, phone: fromPhone, senderName, direction: 'in',
        text: finalText || '',
        mediaPath,
        mediaType,
    });

    await sendEmailToTenant(tenant, tenantId, fromPhone, senderName, finalText);
    recordWaToEmail(tenantId);
    broadcast('message');
    console.log(`[${tenantId}] הודעה מ-${fromPhone} הועברה למייל`);
};
