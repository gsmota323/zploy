import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function createApp(name: string, userId: string) {
  // Cria o app já amarrado ao ID do usuário logado
  return await prisma.app.create({
    data: {
      name,
      userId,
    },
  });
}

export async function getUserApps(userId: string) {
  // Lista apenas os apps que pertencem ao usuário logado
  return await prisma.app.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' } // Traz os mais recentes primeiro
  });
}

export async function deleteApp(appId: string, userId: string) {
  // 1. Busca o app para ver se ele existe
  const app = await prisma.app.findUnique({ where: { id: appId } });

  if (!app) {
    throw new Error('Aplicativo não encontrado.');
  }

  // 2. Trava de Segurança: O app pertence a quem está tentando deletar?
  if (app.userId !== userId) {
    throw new Error('Acesso negado. Você não é o dono deste app.');
  }

  // 3. Deleta do banco
  return await prisma.app.delete({
    where: { id: appId }
  });
}