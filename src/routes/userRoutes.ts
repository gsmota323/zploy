import { Router } from 'express';
import { getMe } from '../controllers/userController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

// Cada usuário só pode consultar o próprio perfil (nunca a lista de outros usuários).
router.get('/me', authMiddleware, getMe);

export default router;