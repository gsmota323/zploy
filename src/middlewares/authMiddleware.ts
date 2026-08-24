import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";
import { ensureStudyModeUserId } from "../services/studyModeService";

export interface AuthRequest extends Request {
  userId?: string;
}

function isAuthEnabled() {
  return process.env.AUTH_ENABLED !== "false";
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!isAuthEnabled()) {
    try {
      req.userId = await ensureStudyModeUserId();
      return next();
    } catch (error) {
      return res.status(500).json({ error: "Não foi possível inicializar o usuário do modo estudo." });
    }
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "Token não fornecido." });
  }

  const [, token] = authHeader.split(" ");

  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    console.error("JWT_SECRET não configurado.");
    return res.status(500).json({
      error: "Erro interno de configuração.",
    });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as {
      userId: string;
      email?: string;
    };

    req.userId = decoded.userId;

    return next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }
};