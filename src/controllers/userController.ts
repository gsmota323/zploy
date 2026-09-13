import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import { getUserById } from "../services/userService";

// Retorna somente o perfil do próprio usuário autenticado (nunca a lista de todos os usuários).
export async function getMe(req: AuthRequest, res: Response) {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: "Usuário não autenticado." });
  }

  const user = await getUserById(userId);

  if (!user) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }

  return res.json(user);
}