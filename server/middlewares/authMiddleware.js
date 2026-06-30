import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';

export const protect = async (req, res, next) => {
  let token;

  if (req.cookies?.token) {
    token = req.cookies.token;
  } else {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) token = auth.split(' ')[1];
  }

  if (!token) return next(new AppError('לא מחובר. יש להתחבר כדי לגשת.', 401));

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return next(new AppError('טוקן לא תקין או פג תוקף. יש להתחבר מחדש.', 401));
  }

  const user = await User.findById(decoded.id);
  if (!user) return next(new AppError('המשתמש שייך לטוקן זה אינו קיים יותר.', 401));
  if (user.active === false) return next(new AppError('החשבון הושבת. פנה למנהל המערכת.', 403));

  req.user = user;
  next();
};

// הגבלת גישה לפי תפקיד — restrictTo('admin') וכו'
export const restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return next(new AppError('אין לך הרשאה לפעולה זו.', 403));
  next();
};
