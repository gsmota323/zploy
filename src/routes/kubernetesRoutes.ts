import { Router } from "express";
import { getPodLogs, getPodStatus } from "../controllers/kubernetesController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.get("/:appId/status", authMiddleware, getPodStatus);
router.get("/:appId/logs", authMiddleware, getPodLogs);

export default router;
