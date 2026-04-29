import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Estendendo a tipagem do Request do Express para aceitar o userId
export interface AuthRequest extends Request {
  userId?: number;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  // 1. Pega o token do cabeçalho de autorização
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  // O padrão é "Bearer <token>", então separamos pelo espaço
  const [, token] = authHeader.split(' ');

  try {
    // 2. Valida o token usando o seu JWT_SECRET do .env
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: number };
    
    // 3. Anexa o ID do usuário na requisição para ser usado no Controller
    req.userId = decoded.userId;
    
    // 4. Libera a passagem
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
};