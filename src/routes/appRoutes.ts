import { Router } from 'express';
import { create, list as listApps, remove as removeApp, startDeploy } from '../controllers/appController';
import { add as addEnv, list as listEnvs, remove as removeEnv } from '../controllers/envController'; // 👈 Importamos o novo controller
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

router.use(authMiddleware);

// --- Rotas de Apps ---
router.post('/', create); 
router.get('/', listApps);
router.delete('/:id', removeApp);

// --- Rotas de Variáveis de Ambiente (Dependentes do App) ---
router.post('/:appId/envs', addEnv);          // Criar variável
router.get('/:appId/envs', listEnvs);         // Listar variáveis do app
router.delete('/:appId/envs/:envId', removeEnv); // Deletar variável específica

router.post('/:id/deploy', authMiddleware, startDeploy);

export default router;