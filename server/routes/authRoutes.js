import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'יותר מדי ניסיונות התחברות. נסה שוב בעוד 15 דקות.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '90d',
  });

router.post('/login', loginLimiter, async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password)
    return next(new AppError('יש להזין אימייל וסיסמה.', 400));

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.correctPassword(password, user.password)))
    return next(new AppError('אימייל או סיסמה שגויים.', 401));

  const token = signToken(user._id);

  res.json({
    status: 'success',
    token,
    data: { user: { _id: user._id, email: user.email, role: user.role } },
  });
});

router.get('/me', protect, (req, res) => {
  res.json({
    status: 'success',
    data: { user: { _id: req.user._id, email: req.user.email, role: req.user.role } },
  });
});

router.post('/logout', (req, res) => {
  res.json({ status: 'success' });
});

export default router;
