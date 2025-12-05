import express from 'express';
import { sendMessage, getChatHistory } from '../controllers/chatController.js';
import { optionalAuth, authenticate } from '../middleware/auth.js';

const router = express.Router();

// Chat endpoint allows anonymous users (optional auth)
router.post('/message', optionalAuth, sendMessage);
// History endpoint requires authentication
router.get('/history', authenticate, getChatHistory);

export default router;

