import { Router } from 'express';
import { login, logout, getMe } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

// Public registration is disabled — accounts are created by the Super Admin.
router.post('/register', (_req, res) => {
  res.status(403).json({
    success: false,
    message: 'Public registration is disabled. Please contact us to get an account.',
  });
});
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', protect, getMe);

export default router;
