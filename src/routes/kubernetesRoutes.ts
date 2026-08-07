import { Router } from "express";
import { getPodLogs } from "../controllers/kubernetesController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.get("/:appId/logs", authMiddleware, getPodLogs);

export default router;
