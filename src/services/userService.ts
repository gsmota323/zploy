import bcrypt from 'bcrypt';
import prisma from '../config/prisma';

export async function createUser(email: string, passwordText: string, username?: string) {
  // 1. Criptografa a senha antes de salvar
  const hashedPassword = await bcrypt.hash(passwordText, 10);
  
  // 2. Salva no banco de dados
  const user = await prisma.user.create({
    data: {
      email,
      username,
      password: hashedPassword,
    },
    // Dica de segurança: Selecionamos apenas id e email para não devolver o hash da senha pro Controller
    select: {
      id: true,
      email: true,
      username: true,
    }
  });

  return user;
}

export async function getUserById(id: string) {
  return await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      username: true,
    }
  });
}