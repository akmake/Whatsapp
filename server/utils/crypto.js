import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

const getKey = () => {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) return null;
    return Buffer.from(hex, 'hex');
};

export const encrypt = (text) => {
    if (!text) return text;
    const key = getKey();
    if (!key) {
        console.warn('[crypto] ENCRYPTION_KEY חסר — סיסמה נשמרת ללא הצפנה');
        return text;
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

export const decrypt = (data) => {
    if (!data) return data;
    if (!data.startsWith('enc:')) return data; // backwards compat: plaintext
    const key = getKey();
    if (!key) return '';
    const parts = data.split(':');
    // enc : iv : tag : encrypted (encrypted itself may contain colons if base64, but we use hex so it's safe)
    const [, ivHex, tagHex, encHex] = parts;
    const iv  = Buffer.from(ivHex,  'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc).toString('utf8') + decipher.final('utf8');
};
