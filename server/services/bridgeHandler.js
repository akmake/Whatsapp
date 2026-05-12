import Tenant from '../models/Tenant.js';
import Message from '../models/Message.js';
import { extractPhone, getMessageText, getMessageType, downloadMedia } from './whatsappManager.js';
import { sendEmailToTenant, recordWaToEmail } from './emailBridgeManager.js';

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
    let inlineImage = null; // { buffer, filename } — for CID embedding in current email only

    if (msgType === 'imageMessage') {
        try {
            const buffer = await downloadMedia(msg, sock);
            const filename = `image_${Date.now()}.jpg`;
            inlineImage = { buffer, filename };
            if (!text) extraText = '📷 תמונה';
        } catch (err) {
            console.error(`[${tenantId}] שגיאה בהורדת תמונה:`, err.message);
            extraText = '📷 תמונה';
        }
    }

    if (msgType === 'videoMessage') {
        try {
            const buffer = await downloadMedia(msg, sock);
            attachments.push({ filename: `video_${Date.now()}.mp4`, content: buffer });
            if (!text) extraText = '🎥 סרטון';
        } catch (err) { extraText = '🎥 סרטון'; }
    }

    if (msgType === 'audioMessage') {
        try {
            const buffer = await downloadMedia(msg, sock);
            attachments.push({ filename: `voice_${Date.now()}.ogg`, content: buffer });
            if (!text) extraText = '🎵 הקלטה קולית';
        } catch (err) { extraText = '🎵 הקלטה קולית'; }
    }

    if (msgType === 'documentMessage') {
        try {
            const buffer = await downloadMedia(msg, sock);
            const filename = msg.message.documentMessage?.fileName || `doc_${Date.now()}.pdf`;
            attachments.push({ filename, content: buffer });
            if (!text) extraText = `📄 ${filename}`;
        } catch (err) { extraText = '📄 קובץ'; }
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
    if (!finalText && attachments.length === 0 && !inlineImage) return;

    await Message.create({ tenantId, phone: fromPhone, senderName, direction: 'in', text: finalText || '📷 תמונה' });

    await sendEmailToTenant(tenant, fromPhone, senderName, finalText, attachments, inlineImage);
    recordWaToEmail(tenantId);
    console.log(`[${tenantId}] הודעה מ-${fromPhone} הועברה למייל`);
};
