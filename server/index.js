import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import globalErrorHandler from './middlewares/errorMiddleware.js';
import AppError from './utils/AppError.js';
import tenantRoutes from './routes/tenantRoutes.js';
import Tenant from './models/Tenant.js';
import { startTenant } from './services/whatsappManager.js';
import { startBridge } from './services/emailBridgeManager.js';
import { handleIncomingWAMessage } from './services/bridgeHandler.js';

dotenv.config();

const app = express();

connectDB();

app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true
}));

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/tenants', tenantRoutes);

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // הפעלת כל הלקוחות הפעילים בעת אתחול
  try {
    const tenants = await Tenant.find({ active: true });
    console.log(`מאתחל ${tenants.length} לקוחות...`);
    for (const tenant of tenants) {
      const id = tenant._id.toString();
      await startTenant(id, handleIncomingWAMessage);
      await startBridge(id, tenant);
    }
  } catch (err) {
    console.error('שגיאה באתחול לקוחות:', err.message);
  }
});
