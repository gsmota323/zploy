import { Router } from 'express';
import { listUsers } from '../controllers/userController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

// Adicionamos o authMiddleware aqui. 
// Agora, NINGUÉM consegue listar os usuários se não mandar um Token JWT válido no Header!
router.get('/', authMiddleware, listUsers);

export default router;