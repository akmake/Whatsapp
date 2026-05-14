import express from 'express';
import Payment from '../models/Payment.js';
import { audit } from '../utils/audit.js';

const router = express.Router({ mergeParams: true });

router.get('/', async (req, res) => {
    const payments = await Payment.find({ tenantId: req.params.id }).sort({ paidAt: -1 });
    res.json(payments);
});

router.post('/', async (req, res) => {
    const { amount, method, period, paidAt, notes } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'סכום לא תקין' });

    const payment = await Payment.create({
        tenantId: req.params.id,
        amount:   Number(amount),
        method:   method || 'other',
        period:   period || '',
        paidAt:   paidAt ? new Date(paidAt) : new Date(),
        notes:    notes || '',
        createdBy: req.user.email,
    });

    await audit(req, 'payment.add', req.params.id, { amount: Number(amount), method, period });
    res.status(201).json(payment);
});

router.delete('/:paymentId', async (req, res) => {
    const payment = await Payment.findOneAndDelete({ _id: req.params.paymentId, tenantId: req.params.id });
    if (!payment) return res.status(404).json({ error: 'תשלום לא נמצא' });
    await audit(req, 'payment.delete', req.params.id, { amount: payment.amount });
    res.json({ ok: true });
});

export default router;
