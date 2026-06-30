// statusManager — ניהול חשבונות BTB וניטור צפיות בסטטוסים.
// רוכב על whatsappManager (אותו מנגנון Baileys כמו WTM) אבל:
//   • מחוץ ל-tenantPool — החיבור נשאר online כדי לתפוס אישורי צפייה.
//   • מתעד כל סטטוס שעולה (StatusPost) וכל צופה (StatusView).
import {
  startTenant,
  stopTenant,
  resetSession,
  resolvePhone,
  getStatus as waGetStatus,
  getQR as waGetQR,
  isConnected as waIsConnected,
  getMessageText,
  getMessageType,
} from './whatsappManager.js';
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
    const post = await StatusPost.findOneAndUpdate(
      { accountId, msgId },
      {
        $setOnInsert: {
          accountId,
          msgId,
          postedAt: m.messageTimestamp ? new Date(Number(m.messageTimestamp) * 1000) : new Date(),
          mediaType: mediaTypeOf(m),
          caption: getMessageText(m),
          thumbnail: thumbnailOf(m),
          bgColor: bgColorOf(m),
          source: 'phone',
        },
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

    broadcast('btb_status');
  } catch (err) {
    logger.error('btb', `onStatusPost failed: ${err.message}`, { accountId });
  }
}

// אישור צפייה => תיעוד צופה (ייחודי לכל סטטוס×צופה)
async function onStatusReceipt(waTenantId, view) {
  const accountId = waTenantId.replace('btb_', '');
  const { msgId, viewerJid, viewedAt, receiptType } = view;
  try {
    const post = await StatusPost.findOne({ accountId, msgId }).select('_id');
    // טלפון אמיתי מתוך ה-@lid; '' אם זה lid שעדיין לא מופה (יזוהה מאוחר יותר ב-backfill)
    const viewerPhone = resolvePhone(waTenantId, viewerJid);
    const res = await StatusView.updateOne(
      { accountId, msgId, viewerJid },
      {
        $setOnInsert: {
          accountId,
          msgId,
          statusId: post?._id ?? null,
          viewerJid,
          viewerPhone,
          viewedAt: viewedAt ?? new Date(),
          receiptType: receiptType ?? 'read',
        },
      },
      { upsert: true }
    );
    // צופה חדש => מגדילים את מונה הצפיות של הסטטוס
    if (res.upsertedCount > 0 && post?._id) {
      await StatusPost.updateOne({ _id: post._id }, { $inc: { viewsCount: 1 } });
    }
    broadcast('btb_status');
  } catch (err) {
    if (err?.code !== 11000) // התעלמות מכפילות מירוץ
      logger.error('btb', `onStatusReceipt failed: ${err.message}`, { accountId });
  }
}

// ─── lifecycle ────────────────────────────────────────────────────

// ניסיון לזהות צופים שנשמרו ללא טלפון (lid שלא היה ממופה בזמן הצפייה).
// מיפוי ה-LID מתעשר עם הזמן (contacts.upsert + קבצי session), אז כדאי לנסות שוב.
export async function resolveUnknownViewers(accountId) {
  const unknown = await StatusView.find({ accountId, viewerPhone: '' }).select('_id viewerJid');
  let resolved = 0;
  for (const v of unknown) {
    const phone = resolvePhone(waId(accountId), v.viewerJid);
    if (phone) {
      await StatusView.updateOne({ _id: v._id }, { $set: { viewerPhone: phone } });
      resolved++;
    }
  }
  if (resolved) broadcast('btb_status');
  return { checked: unknown.length, resolved };
}

export const connect = (accountId) =>
  startTenant(waId(accountId), async () => {}, { onStatusPost, onStatusReceipt });

export const disconnect = (accountId) => stopTenant(waId(accountId));
export const reset      = (accountId) => resetSession(waId(accountId));

export const getStatus   = (accountId) => waGetStatus(waId(accountId));
export const getQR       = (accountId) => waGetQR(waId(accountId));
export const isConnected = (accountId) => waIsConnected(waId(accountId));

export { waId };
