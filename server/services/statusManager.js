// statusManager — ניהול חשבונות BTB וניטור צפיות בסטטוסים.
// רוכב על whatsappManager (אותו מנגנון Baileys כמו WTM) אבל:
//   • מחוץ ל-tenantPool — החיבור נשאר online כדי לתפוס אישורי צפייה.
//   • מתעד כל סטטוס שעולה (StatusPost) וכל צופה (StatusView).
import {
  startTenant,
  stopTenant,
  resetSession,
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

const jidToPhone = (jid = '') =>
  jid.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/\D/g, '');

const mediaTypeOf = (m) => {
  const t = getMessageType(m);
  if (t === 'imageMessage') return 'image';
  if (t === 'videoMessage') return 'video';
  return 'text';
};

// ─── hooks ────────────────────────────────────────────────────────

// סטטוס שזוהה שעלה (מהטלפון בעיקר; העלאות שלנו נרשמות ב-recordUpload)
async function onStatusPost(waTenantId, m) {
  const accountId = waTenantId.replace('btb_', '');
  const msgId = m.key.id;
  try {
    await StatusPost.updateOne(
      { accountId, msgId },
      {
        $setOnInsert: {
          accountId,
          msgId,
          postedAt: m.messageTimestamp ? new Date(Number(m.messageTimestamp) * 1000) : new Date(),
          mediaType: mediaTypeOf(m),
          caption: getMessageText(m),
          source: 'phone',
        },
      },
      { upsert: true }
    );
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
    const res = await StatusView.updateOne(
      { accountId, msgId, viewerJid },
      {
        $setOnInsert: {
          accountId,
          msgId,
          statusId: post?._id ?? null,
          viewerJid,
          viewerPhone: jidToPhone(viewerJid),
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

export const connect = (accountId) =>
  startTenant(waId(accountId), async () => {}, { onStatusPost, onStatusReceipt });

export const disconnect = (accountId) => stopTenant(waId(accountId));
export const reset      = (accountId) => resetSession(waId(accountId));

export const getStatus   = (accountId) => waGetStatus(waId(accountId));
export const getQR       = (accountId) => waGetQR(waId(accountId));
export const isConnected = (accountId) => waIsConnected(waId(accountId));

export { waId };
