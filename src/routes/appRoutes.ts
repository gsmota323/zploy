import { Router } from 'express';

import { create, list as listApps, remove as removeApp } from '../controllers/appController';
import { startDeploy } from '../controllers/deployController'; 
import { add as addEnv, list as listEnvs, remove as removeEnv } from '../controllers/envController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

// Middleware aplicado globalmente para TODAS as rotas abaixo
router.use(authMiddleware);

// --- Rotas de Apps ---
router.post('/', create); 
router.get('/', listApps);
router.delete('/:id', removeApp);

// --- Rota de Deploy (Foca no DeployController) ---
// Note que removemos o 'authMiddleware' daqui pois já está protegido pelo router.use
router.post('/:id/deploy', startDeploy);

// --- Rotas de Variáveis de Ambiente ---
router.post('/:appId/envs', addEnv);
router.get('/:appId/envs', listEnvs);
router.delete('/:appId/envs/:envId', removeEnv);

export default router;