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

    const MEDIA_LABEL = {
        imageMessage:    '📷 תמונה',
        videoMessage:    '🎥 סרטון',
        audioMessage:    '🎵 הקלטה קולית',
        documentMessage: '📄 קובץ',
    };

    if (MEDIA_LABEL[msgType]) {
        try {
            const buffer = await downloadMedia(msg, sock);
            let filename;
            if (msgType === 'imageMessage')    filename = `image_${Date.now()}.jpg`;
            else if (msgType === 'videoMessage')    filename = `video_${Date.now()}.mp4`;
            else if (msgType === 'audioMessage')    filename = `voice_${Date.now()}.ogg`;
            else filename = msg.message.documentMessage.fileName || `doc_${Date.now()}.pdf`;
            attachments.push({ filename, content: buffer });
            if (!text) extraText = MEDIA_LABEL[msgType];
        } catch (err) {
            console.error(`[${tenantId}] שגיאה בהורדת מדיה:`, err.message);
            extraText = MEDIA_LABEL[msgType];
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
    if (!finalText && attachments.length === 0) return;

    await Message.create({ tenantId, phone: fromPhone, senderName, direction: 'in', text: finalText });

    await sendEmailToTenant(tenant, fromPhone, senderName, finalText, attachments);
    recordWaToEmail(tenantId);
    console.log(`[${tenantId}] הודעה מ-${fromPhone} הועברה למייל`);
};
