import { Router } from 'express';

import { create, list as listApps, remove as removeApp, redeployLast } from '../controllers/appController';
import { startDeploy, stopApp } from '../controllers/deployController'; 
import { add as addEnv, list as listEnvs, remove as removeEnv } from '../controllers/envController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { deployLimiter } from '../middlewares/rateLimiter';


const router = Router();

// Middleware aplicado globalmente para TODAS as rotas abaixo
router.use(authMiddleware);

// --- Rotas de Apps ---
router.post('/', create); 
router.get('/', listApps);
router.delete('/:id', removeApp);

// --- Rota de Deploy (Foca no DeployController) ---
// Note que removemos o 'authMiddleware' daqui pois já está protegido pelo router.use
router.post('/:id/deploy', deployLimiter, startDeploy);
router.post('/:id/redeploy', deployLimiter, redeployLast);

// --- Rotas de Variáveis de Ambiente ---
router.post('/:appId/envs', addEnv);
router.get('/:appId/envs', listEnvs);
router.delete('/:appId/envs/:envId', removeEnv);

router.post("/:id/stop", stopApp);
export default router;