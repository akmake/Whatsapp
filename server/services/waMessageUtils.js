import { downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';

export const getMessageText = (msg) => {
    const m = msg.message;
    if (!m) return '';
    return m.conversation
        || m.extendedTextMessage?.text
        || m.imageMessage?.caption
        || m.videoMessage?.caption
        || m.documentMessage?.caption
        || '';
};

export const getMessageType = (msg) => {
    const m = msg.message;
    if (!m) return 'unknown';
    return Object.keys(m).find(k =>
        !['messageContextInfo', 'senderKeyDistributionMessage'].includes(k)
    ) || 'unknown';
};

export const downloadMedia = async (msg, sock) =>
    await downloadMediaMessage(msg, 'buffer', {}, {
        logger: pino({ level: 'silent' }),
        reuploadRequest: sock,
    });
