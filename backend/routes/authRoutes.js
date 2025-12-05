import express from 'express';
import { register, login } from '../controllers/authController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', authenticate, requireAdmin, register);
router.post('/login', login);

export default router;



