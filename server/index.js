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
import { logger, setMongoSink } from './utils/logger.js';
import authRoutes from './routes/authRoutes.js';
import tenantRoutes from './routes/tenantRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import sseRoutes from './routes/sseRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import noteRoutes from './routes/noteRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import logRoutes from './routes/logRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import btbRoutes from './routes/btbRoutes.js';
import Tenant from './models/Tenant.js';
import BtbAccount from './models/BtbAccount.js';
import * as statusManager from './services/statusManager.js';
import LogEntry from './models/LogEntry.js';
import { poolAdd, startConveyor, poolQueueSend } from './services/tenantPool.js';
import { registerQueueSend } from './services/emailBridgeManager.js';
import { startMediaCleanup } from './services/mediaCleanup.js';
import { startHealthMonitor, getHealthSnapshot } from './services/healthMonitor.js';
import { assertEncryptionKey } from './utils/crypto.js';

dotenv.config();

// ─── fail-fast: סודות חובה ────────────────────────────────────────
try {
    assertEncryptionKey();
} catch (err) {
    console.error('[startup]', err.message);
    logger.fatal('startup', err.message);
    process.exit(1);
}

// ─── crash handlers ───────────────────────────────────────────────

process.on('uncaughtException', (err) => {
    logger.fatal('crash', `uncaughtException: ${err.message}`, { stack: err.stack });
    console.error('[process] uncaughtException:', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
    const msg   = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack   : undefined;
    logger.error('crash', `unhandledRejection: ${msg}`, { stack });
    console.error('[process] unhandledRejection:', reason);
});

process.on('SIGTERM', () => {
    logger.info('server', 'SIGTERM received — graceful shutdown');
});

const app = express();

logger.info('server', 'starting up', { pid: process.pid });

app.set('trust proxy', 1);
app.use(helmet());
app.use(cookieParser());

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
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
app.use('/api/tenants',              protect, tenantRoutes);
app.use('/api/dashboard',            protect, dashboardRoutes);
app.use('/api/events',                        sseRoutes);
app.use('/api/tenants/:id/payments', protect, paymentRoutes);
app.use('/api/tenants/:id/notes',    protect, noteRoutes);
app.use('/api/audit',                protect, auditRoutes);
app.use('/api/logs',                          logRoutes);
app.use('/api/media',                         mediaRoutes);
app.use('/api/btb',                  protect, btbRoutes);

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

const PORT = process.env.PORT || 5000;

// ─── אתחול: DB → האזנה → טעינת לקוחות לפול ──────────────────────
const start = async () => {
  // 1. חיבור DB חוסם — אסור להאזין/לטעון לקוחות לפני שיש DB
  await connectDB();
  setMongoSink(entry =>
    LogEntry.create({ ...entry, ts: new Date(entry.ts) })
  );

  // 2. רק עכשיו מתחילים להאזין
  app.listen(PORT, async () => {
    logger.info('server', `listening on port ${PORT}`);
    console.log(`Server running on port ${PORT}`);

    try {
      registerQueueSend(poolQueueSend);
      startMediaCleanup();
      startHealthMonitor();
      const tenants = await Tenant.find({ active: true });
      logger.info('server', `loading ${tenants.length} tenants into pool`);
      console.log(`טוען ${tenants.length} לקוחות לפול...`);
      for (const tenant of tenants) {
        poolAdd(tenant._id.toString(), tenant);
      }
      startConveyor();

      // BTB — חשבונות סטטוסים: נשארים מחוברים (מחוץ ל-pool) לתפיסת צפיות
      const btbAccounts = await BtbAccount.find({ active: true });
      logger.info('server', `connecting ${btbAccounts.length} BTB accounts`);
      console.log(`מחבר ${btbAccounts.length} חשבונות BTB...`);
      for (const acc of btbAccounts) {
        statusManager.connect(acc._id.toString()).catch(err =>
          logger.error('btb', `connect failed: ${err.message}`, { accountId: acc._id.toString() })
        );
      }
    } catch (err) {
      logger.error('server', `init error: ${err.message}`, { stack: err.stack });
      console.error('שגיאה באתחול לקוחות:', err.message);
    }
  });
};

start().catch((err) => {
  logger.fatal('startup', `failed to start: ${err.message}`, { stack: err.stack });
  console.error('[startup] נכשל:', err.message);
  process.exit(1);
});
