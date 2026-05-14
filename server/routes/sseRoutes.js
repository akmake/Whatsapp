import express from 'express';
import { addSseClient } from '../services/sseManager.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', protect, (req, res) => addSseClient(res));

export default router;
