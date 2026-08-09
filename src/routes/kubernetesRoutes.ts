import { Router } from "express";
import { getPodLogs, getPodStatus, rollbackDeployment } from "../controllers/kubernetesController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.get("/:appId/status", authMiddleware, getPodStatus);
router.get("/:appId/health", authMiddleware, getPodStatus);
router.get("/:appId/logs", authMiddleware, getPodLogs);
router.post("/:appId/rollback", authMiddleware, rollbackDeployment);

export default router;
