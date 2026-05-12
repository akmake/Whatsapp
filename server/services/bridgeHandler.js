import Tenant from '../models/Tenant.js';
import { extractPhone, getMessageText, getMessageType, downloadMedia } from './whatsappManager.js';
import { sendEmailToTenant, recordWaToEmail } from './emailBridgeManager.js';

export const handleIncomingWAMessage = async (tenantId, msg, sock) => {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant || !tenant.active) return;

    const fromPhone = extractPhone(msg);
    if (!fromPhone) return;

    const senderName = msg.pushName || fromPhone;
    const text = getMessageText(msg);
    const msgType = getMessageType(msg);

    let attachments = [];

    if (['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage'].includes(msgType)) {
        try {
            const buffer = await downloadMedia(msg, sock);
            let filename = 'file';
            if (msgType === 'imageMessage') filename = `image_${Date.now()}.jpg`;
            else if (msgType === 'videoMessage') filename = `video_${Date.now()}.mp4`;
            else if (msgType === 'audioMessage') filename = `voice_${Date.now()}.ogg`;
            else if (msgType === 'documentMessage') filename = msg.message.documentMessage.fileName || `doc_${Date.now()}.pdf`;
            attachments.push({ filename, content: buffer });
        } catch (err) {
            console.error(`[${tenantId}] שגיאה בהורדת מדיה:`, err.message);
        }
    }

    if (msgType === 'contactMessage') {
        const vcard = msg.message.contactMessage.vcard;
        const name = msg.message.contactMessage.displayName || 'contact';
        attachments.push({ filename: `${name}.vcf`, content: Buffer.from(vcard, 'utf8') });
    }

    if (msgType === 'contactsArrayMessage') {
        const contacts = msg.message.contactsArrayMessage.contacts || [];
        for (const c of contacts) {
            const name = c.displayName || 'contact';
            attachments.push({ filename: `${name}.vcf`, content: Buffer.from(c.vcard, 'utf8') });
        }
    }

    if (!text && attachments.length === 0) return;

    await sendEmailToTenant(tenant, fromPhone, senderName, text, attachments);
    recordWaToEmail(tenantId);
    console.log(`[${tenantId}] הודעה מ-${fromPhone} הועברה למייל`);
};
