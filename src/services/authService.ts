import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function authenticateUser(email: string, passwordText: string) {
  // 1. Busca o usuário no banco pelo email
  const user = await prisma.user.findUnique({ where: { email } });
  
  // Se não achar o usuário, retorna nulo
  if (!user) return null;

  // 2. Compara a senha enviada em texto com o hash salvo no banco
  const isValidPassword = await bcrypt.compare(passwordText, user.password);
  
  // Se a senha estiver errada, retorna nulo
  if (!isValidPassword) return null;

  // 3. Gera o Token JWT se tudo estiver correto
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET as string,
    { expiresIn: '1d' } // Expira em 1 dia
  );

  return token;
}