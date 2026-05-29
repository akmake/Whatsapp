import Message from '../models/Message.js';

export const exportConversation = async ({ tenantId, type, groupId, phone, dateFrom, dateTo }) => {
    const from = dateFrom ? new Date(dateFrom) : (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d; })();
    const to   = dateTo   ? new Date(dateTo)   : new Date();

    const normalizedGroupId = groupId ? groupId.replace(/:\d+$/, '') : groupId;
    const query = {
        tenantId,
        createdAt: { $gte: from, $lte: to },
        ...(type === 'group' ? { groupJid: normalizedGroupId } : { phone, groupJid: null }),
    };

    const messages = await Message.find(query).sort({ createdAt: 1 }).lean();
    if (messages.length === 0) throw new Error('לא נמצאו הודעות בטווח התאריכים שנבחר');

    const groupLabel = type === 'group'
        ? (messages.find(m => m.groupName)?.groupName || groupId)
        : phone;

    return {
        meta: {
            source:    groupLabel,
            type,
            dateFrom:  from.toISOString(),
            dateTo:    to.toISOString(),
            count:     messages.length,
            exported:  new Date().toISOString(),
        },
        messages: messages.map(m => ({
            timestamp:  m.createdAt,
            direction:  m.direction,
            sender:     m.direction === 'out' ? 'אנחנו' : (m.senderName || m.phone),
            phone:      m.phone,
            text:       m.text || null,
            mediaType:  m.mediaType || null,
        })),
    };
};
