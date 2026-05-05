import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function saveEnv(appId: string, key: string, value: string) {
  // Verifica se a variável já existe (ex: DATABASE_URL)
  const existing = await prisma.envVar.findFirst({
    where: { appId, key }
  });

  // Se existir, atualiza. Se não, cria uma nova.
  if (existing) {
    return await prisma.envVar.update({
      where: { id: existing.id },
      data: { value }
    });
  }

  return await prisma.envVar.create({
    data: { appId, key, value }
  });
}

export async function listEnvs(appId: string) {
  return await prisma.envVar.findMany({
    where: { appId }
  });
}

export async function deleteEnv(envId: string) {
  return await prisma.envVar.delete({
    where: { id: envId }
  });
}