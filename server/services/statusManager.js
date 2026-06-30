// statusManager — ניהול חשבונות BTB וניטור צפיות בסטטוסים.
// רוכב על whatsappManager (אותו מנגנון Baileys כמו WTM) אבל:
//   • מחוץ ל-tenantPool — החיבור נשאר online כדי לתפוס אישורי צפייה.
//   • מתעד כל סטטוס שעולה (StatusPost) וכל צופה (StatusView).
import { randomUUID } from 'crypto';
import {
  startTenant,
  stopTenant,
  resetSession,
  resolvePhone,
  resolveContact,
  sendMessage as waSend,
  getContactJids,
  getStatus as waGetStatus,
  getQR as waGetQR,
  isConnected as waIsConnected,
  getMessageText,
  getMessageType,
} from './whatsappManager.js';
import { processImage, processVideo } from './statusMedia.js';
import StatusPost from '../models/StatusPost.js';
import StatusView from '../models/StatusView.js';
import { broadcast } from './sseManager.js';
import { logger } from '../utils/logger.js';

// namespace ל-session/instance של BTB כדי לא להתנגש ב-WTM
const waId = (accountId) => `btb_${accountId}`;

const mediaTypeOf = (m) => {
  const t = getMessageType(m);
  if (t === 'imageMessage') return 'image';
  if (t === 'videoMessage') return 'video';
  return 'text';
};

// jpegThumbnail מובנה בהודעת תמונה/ווידאו => data URL לכרטיסיה (בלי הורדה)
const thumbnailOf = (m) => {
  const msg = m.message || {};
  const thumb = msg.imageMessage?.jpegThumbnail || msg.videoMessage?.jpegThumbnail;
  if (!thumb) return '';
  try { return `data:image/jpeg;base64,${Buffer.from(thumb).toString('base64')}`; }
  catch { return ''; }
};

// ARGB (int) של סטטוס טקסט => צבע hex לרקע הכרטיסיה
const bgColorOf = (m) => {
  const argb = m.message?.extendedTextMessage?.backgroundArgb;
  if (!argb && argb !== 0) return '';
  return '#' + (argb >>> 0).toString(16).padStart(8, '0').slice(2); // מתעלמים מ-alpha
};

// ─── hooks ────────────────────────────────────────────────────────

// סטטוס שזוהה שעלה (מהטלפון בעיקר; העלאות שלנו נרשמות ב-recordUpload)
async function onStatusPost(waTenantId, m) {
  const accountId = waTenantId.replace('btb_', '');
  const msgId = m.key.id;
  try {
    // $set מעשיר גם כרטיסייה שכבר נוצרה כ-stub מתוך רסיט
    const post = await StatusPost.findOneAndUpdate(
      { accountId, msgId },
      {
        $set: {
          postedAt: m.messageTimestamp ? new Date(Number(m.messageTimestamp) * 1000) : new Date(),
          mediaType: mediaTypeOf(m),
          caption: getMessageText(m),
          thumbnail: thumbnailOf(m),
          bgColor: bgColorOf(m),
        },
        // source נקבע רק ביצירה — לא דורסים 'upload' של סטטוס שהעלינו בעצמנו
        $setOnInsert: { accountId, msgId, source: 'phone' },
      },
      { upsert: true, new: true }
    );

    // קישור צפיות שכבר נרשמו (רסיט שהגיע לפני שזיהינו את הסטטוס) + ספירה מחדש
    await StatusView.updateMany(
      { accountId, msgId, statusId: null },
      { $set: { statusId: post._id } }
    );
    const viewsCount = await StatusView.countDocuments({ accountId, msgId });
    if (viewsCount !== post.viewsCount) {
      await StatusPost.updateOne({ _id: post._id }, { $set: { viewsCount } });
    }

    logger.warn('btb', `[DIAG] onStatusPost ok post=${post._id} mtype=${post.mediaType}`, { accountId, msgId });
    broadcast('btb_status');
  } catch (err) {
    logger.error('btb', `onStatusPost failed: ${err.message}`, { accountId, stack: err.stack });
  }
}

// אישור צפייה => תיעוד צופה (ייחודי לכל סטטוס×צופה)
async function onStatusReceipt(waTenantId, view) {
  const accountId = waTenantId.replace('btb_', '');
  const { msgId, viewerJid, viewedAt, receiptType } = view;
  try {
    // יוצרים/מוודאים כרטיסיית סטטוס מתוך הרסיט עצמו (גם אם ההודעה היוצאת לא סונכרנה).
    // אם onStatusPost כבר רץ — הכרטיסייה קיימת עם התוכן המלא ולא נדרסת.
    const post = await StatusPost.findOneAndUpdate(
      { accountId, msgId },
      { $setOnInsert: { accountId, msgId, mediaType: 'unknown', source: 'phone', postedAt: viewedAt ?? new Date() } },
      { upsert: true, new: true }
    );
    const viewerPhone = resolvePhone(waTenantId, viewerJid);
    const res = await StatusView.updateOne(
      { accountId, msgId, viewerJid },
      {
        $setOnInsert: {
          accountId,
          msgId,
          statusId: post._id,
          viewerJid,
          viewerPhone,
          viewedAt: viewedAt ?? new Date(),
          receiptType: receiptType ?? 'read',
        },
      },
      { upsert: true }
    );
    // צופה חדש => מגדילים את מונה הצפיות של הסטטוס
    if (res.upsertedCount > 0) {
      await StatusPost.updateOne({ _id: post._id }, { $inc: { viewsCount: 1 } });
    }
    logger.warn('btb', `[DIAG] onStatusReceipt ok post=${post._id} mtype=${post.mediaType} newView=${res.upsertedCount > 0}`, { accountId, msgId });
    broadcast('btb_status');
  } catch (err) {
    if (err?.code !== 11000) // התעלמות מכפילות מירוץ
      logger.error('btb', `onStatusReceipt failed: ${err.message}`, { accountId, stack: err.stack });
  }
}

// ─── lifecycle ────────────────────────────────────────────────────

// פתרון בזמן אמת של צופה => { phone, name } מתוך מיפויי ה-instance.
export const resolveViewer = (accountId, jid) => resolveContact(waId(accountId), jid);

// מספר הנמענים (אנשי הקשר) שיראו את הסטטוס
export const getAudienceSize = (accountId) => getContactJids(waId(accountId)).length;

// העלאת סטטוס דרך הדשבורד: עיבוד מדיה -> שליחה ל-status@broadcast -> תיעוד.
// ווידאו ארוך נחתך אוטומטית למקטעי 30ש' שעולים ברצף.
export async function postStatus(accountId, { type, buffer, caption = '', bgColor = '', font }) {
  const tenantId = waId(accountId);
  if (!waIsConnected(tenantId)) throw new Error('החשבון לא מחובר');

  const recipients = getContactJids(tenantId); // statusJidList — בלי זה אף אחד לא רואה

  let pieces;
  if (type === 'image') {
    pieces = [{ content: { image: await processImage(buffer), caption } }];
  } else if (type === 'video') {
    const segs = await processVideo(buffer);
    pieces = segs.map((b, i) => ({ content: { video: b, caption: i === 0 ? caption : '' } }));
  } else if (type === 'text') {
    const options = {};
    if (bgColor) options.backgroundColor = bgColor;
    if (font !== undefined && font !== null && !Number.isNaN(font)) options.font = font;
    pieces = [{ content: { text: caption }, options }];
  } else {
    throw new Error('סוג סטטוס לא נתמך');
  }

  const batchId = randomUUID();
  let count = 0;
  for (let i = 0; i < pieces.length; i++) {
    const opts = { statusJidList: recipients, ...(pieces[i].options || {}) };
    const sent = await waSend(tenantId, 'status@broadcast', pieces[i].content, opts);
    const msgId = sent?.key?.id;
    if (!msgId) continue;
    await StatusPost.findOneAndUpdate(
      { accountId, msgId },
      {
        $set: {
          postedAt: new Date(),
          mediaType: type,
          caption: i === 0 ? caption : '',
          thumbnail: thumbnailOf(sent),
          bgColor: bgColor || '',
          source: 'upload',
          batchId, segmentIndex: i, segmentCount: pieces.length,
        },
        $setOnInsert: { accountId, msgId },
      },
      { upsert: true, new: true }
    );
    count++;
  }

  broadcast('btb_status');
  logger.info('btb', `posted status: ${count} piece(s) to ${recipients.length} recipients`, { accountId });
  return { count, recipients: recipients.length };
}

export const connect = (accountId) =>
  startTenant(waId(accountId), async () => {}, { onStatusPost, onStatusReceipt, emitOwnEvents: true });

export const disconnect = (accountId) => stopTenant(waId(accountId));
export const reset      = (accountId) => resetSession(waId(accountId));

export const getStatus   = (accountId) => waGetStatus(waId(accountId));
export const getQR       = (accountId) => waGetQR(waId(accountId));
export const isConnected = (accountId) => waIsConnected(waId(accountId));

export { waId };
