import prisma from '../config/prisma';
import { encryptEnvValue } from '../utils/envCrypto';

export async function saveEnv(appId: string, key: string, value: string) {
  // Verifica se a variável já existe (ex: DATABASE_URL)
  const existing = await prisma.envVar.findFirst({
    where: { appId, key }
  });

  const encryptedValue = encryptEnvValue(value);

  // Se existir, atualiza. Se não, cria uma nova.
  if (existing) {
    return await prisma.envVar.update({
      where: { id: existing.id },
      data: { value: encryptedValue }
    });
  }

  return await prisma.envVar.create({
    data: { appId, key, value: encryptedValue }
  });
}

// Retorna os registros como estão armazenados (valor cifrado) - nunca descriptografa para listagem/consulta.
export async function listEnvs(appId: string) {
  return await prisma.envVar.findMany({
    where: { appId }
  });
}

export async function deleteEnv(envId: string, appId: string) {
  const env = await prisma.envVar.findFirst({
    where: {
      id: envId,
      appId,
    },
  });

  if (!env) {
    throw new Error("Variável de ambiente não encontrada.");
  }

  return await prisma.envVar.delete({
    where: {
      id: envId,
    },
  });
}