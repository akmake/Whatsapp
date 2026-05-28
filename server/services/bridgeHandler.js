import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import Tenant from '../models/Tenant.js';
import Message from '../models/Message.js';
import { extractPhone } from './whatsappManager.js';
import { getMessageText, getMessageType, downloadMedia } from './waMessageUtils.js';
import { sendEmailToTenant, recordWaToEmail } from './emailBridgeManager.js';
import { transcribeAudio } from './transcribe.js';
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

// ─── group name cache (5 min TTL) ───────────────────────────────
const groupNameCache = new Map();
const GROUP_CACHE_TTL = 5 * 60 * 1000;

const getGroupName = async (sock, groupJid) => {
    const cached = groupNameCache.get(groupJid);
    if (cached && Date.now() - cached.ts < GROUP_CACHE_TTL) return cached.name;
    try {
        const meta = await sock.groupMetadata(groupJid);
        const name = meta.subject || groupJid.replace('@g.us', '');
        groupNameCache.set(groupJid, { name, ts: Date.now() });
        return name;
    } catch {
        return groupJid.replace('@g.us', '');
    }
};

export const handleIncomingWAMessage = async (tenantId, msg, sock) => {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant || !tenant.active) return;

    const remoteJid  = msg.key.remoteJid || '';
    const isGroup    = remoteJid.endsWith('@g.us');
    const senderJid  = isGroup ? (msg.key.participant || '') : remoteJid;

    const fromPhone = senderJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
        || extractPhone(msg, tenantId);
    if (!fromPhone) return;

    const senderName = msg.pushName || fromPhone;
    const text       = getMessageText(msg);
    const msgType    = getMessageType(msg);

    let groupContext = null;
    if (isGroup) {
        if (!tenant.groupsEnabled) return;
        const groupId = remoteJid.replace('@g.us', '');
        const allowed = tenant.allowedGroups?.some(g => g.groupId === groupId);
        if (!allowed) return;
        const groupName = await getGroupName(sock, remoteJid);
        groupContext = { groupId, groupName };
    }

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
            const transcript = await transcribeAudio(mediaPath);
            extraText = transcript || '🎵 הקלטה קולית';
            if (transcript) console.log(`[${tenantId}] תמלול: "${transcript.slice(0, 60)}..."`);
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

    if (msgType === 'locationMessage') {
        const loc = msg.message.locationMessage;
        const lat  = loc.degreesLatitude;
        const lng  = loc.degreesLongitude;
        const name = loc.name || loc.address || '';
        const url  = `https://maps.google.com/maps?q=${lat},${lng}`;
        extraText = `📍 מיקום${name ? `: ${name}` : ''}\n${url}`;
    }

    if (msgType === 'stickerMessage') {
        try {
            const buffer = await downloadMedia(msg, sock);
            mediaPath = saveMedia(tenantId, `stk_${Date.now()}_${token()}.webp`, buffer);
            mediaType = 'image';
            extraText = '🎭 סטיקר';
        } catch (err) {
            console.error(`[${tenantId}] שגיאת הורדת סטיקר:`, err.message);
            extraText = '🎭 סטיקר';
        }
    }

    if (msgType === 'reactionMessage') {
        const emoji = msg.message.reactionMessage?.text;
        if (!emoji) return; // הסרת תגובה — מתעלמים
        extraText = `${emoji} תגובה להודעה`;
    }

    const finalText = [text, extraText].filter(Boolean).join('\n');
    if (!finalText && !mediaPath) return;

    await Message.create({
        tenantId,
        phone: fromPhone,
        senderName,
        direction: 'in',
        text: finalText || '',
        mediaPath,
        mediaType,
        ...(groupContext && { groupJid: groupContext.groupId, groupName: groupContext.groupName }),
    });

    await sendEmailToTenant(tenant, tenantId, fromPhone, senderName, finalText, groupContext);
    recordWaToEmail(tenantId);
    broadcast('message');
    console.log(`[${tenantId}] הודעה מ-${fromPhone}${groupContext ? ` [${groupContext.groupName}]` : ''} הועברה למייל`);
};
