import express from 'express';
import SupportNote from '../models/SupportNote.js';
import { audit } from '../utils/audit.js';

const router = express.Router({ mergeParams: true });

router.get('/', async (req, res) => {
    const notes = await SupportNote.find({ tenantId: req.params.id }).sort({ resolved: 1, createdAt: -1 });
    res.json(notes);
});

router.post('/', async (req, res) => {
    const { content, priority } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'תוכן ההערה הוא חובה' });

    const note = await SupportNote.create({
        tenantId:  req.params.id,
        content:   content.trim(),
        priority:  priority || 'medium',
        createdBy: req.user.email,
    });

    await audit(req, 'note.add', req.params.id, { priority });
    res.status(201).json(note);
});

router.put('/:noteId', async (req, res) => {
    const { content, priority, resolved } = req.body;
    const update = { updatedAt: new Date() };
    if (content   !== undefined) update.content  = content.trim();
    if (priority  !== undefined) update.priority = priority;
    if (resolved  !== undefined) {
        update.resolved   = resolved;
        update.resolvedAt = resolved ? new Date() : null;
    }

    const note = await SupportNote.findOneAndUpdate(
        { _id: req.params.noteId, tenantId: req.params.id },
        update, { new: true }
    );
    if (!note) return res.status(404).json({ error: 'הערה לא נמצאה' });

    await audit(req, 'note.update', req.params.id, { resolved });
    res.json(note);
});

router.delete('/:noteId', async (req, res) => {
    const note = await SupportNote.findOneAndDelete({ _id: req.params.noteId, tenantId: req.params.id });
    if (!note) return res.status(404).json({ error: 'הערה לא נמצאה' });
    await audit(req, 'note.delete', req.params.id);
    res.json({ ok: true });
});

export default router;
