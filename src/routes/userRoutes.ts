import { Router } from "express";
import { register, listUsers } from "../controllers/userController";

const router = Router();

router.post("/", register);
router.get("/", listUsers);

export default router; 