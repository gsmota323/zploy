import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function createUser(email: string, passwordText: string) {
  // 1. Criptografa a senha antes de salvar
  const hashedPassword = await bcrypt.hash(passwordText, 10);
  
  // 2. Salva no banco de dados
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
    },
    // Dica de segurança: Selecionamos apenas id e email para não devolver o hash da senha pro Controller
    select: {
      id: true,
      email: true
    }
  });

  return user;
}

export async function getAllUsers() {
  return await prisma.user.findMany({
    select: {
      id: true,
      email: true
    }
  });
}