import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import connectDB from './config/db.js';
import globalErrorHandler from './middlewares/errorMiddleware.js';
import { protect } from './middlewares/authMiddleware.js';
import AppError from './utils/AppError.js';
import authRoutes from './routes/authRoutes.js';
import tenantRoutes from './routes/tenantRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import sseRoutes from './routes/sseRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import noteRoutes from './routes/noteRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import Tenant from './models/Tenant.js';
import { poolAdd, startConveyor, poolQueueSend } from './services/tenantPool.js';
import { registerQueueSend } from './services/emailBridgeManager.js';
import { startMediaCleanup } from './services/mediaCleanup.js';

dotenv.config();

process.on('uncaughtException', (err) => {
    console.error('[process] uncaughtException:', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
    console.error('[process] unhandledRejection:', reason);
});

const app = express();

connectDB();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cookieParser());

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (curl, mobile apps, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10kb' }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'יותר מדי בקשות, נסה שוב מאוחר יותר.' },
});
app.use('/api', globalLimiter);

app.get('/', (req, res) => res.json({ status: 'ok' }));

// public
app.use('/api/auth', authRoutes);

// protected
app.use('/api/tenants',   protect, tenantRoutes);
app.use('/api/dashboard', protect, dashboardRoutes);
app.use('/api/events',                    sseRoutes);
app.use('/api/tenants/:id/payments', protect, paymentRoutes);
app.use('/api/tenants/:id/notes',    protect, noteRoutes);
app.use('/api/audit',                protect, auditRoutes);

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  try {
    registerQueueSend(poolQueueSend);
    startMediaCleanup();
    const tenants = await Tenant.find({ active: true });
    console.log(`טוען ${tenants.length} לקוחות לפול...`);
    for (const tenant of tenants) {
      poolAdd(tenant._id.toString(), tenant);
    }
    startConveyor();
  } catch (err) {
    console.error('שגיאה באתחול לקוחות:', err.message);
  }
});
