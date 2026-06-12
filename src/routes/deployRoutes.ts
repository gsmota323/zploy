import { Router } from "express";
import { listarLogsDeploy } from "../controllers/deployController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.get("/:deployId/logs", authMiddleware, listarLogsDeploy);

export default router;