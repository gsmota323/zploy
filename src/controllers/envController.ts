import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { PrismaClient } from '@prisma/client';
import { saveEnv, listEnvs, deleteEnv } from '../services/envService';

const prisma = new PrismaClient();

// Função auxiliar para garantir que utilizadores mal-intencionados não mexam em apps dos outros
async function checkAppOwnership(appId: string, userId: string) {
  const app = await prisma.app.findUnique({ where: { id: appId } });
  if (!app) throw new Error('Aplicativo não encontrado.');
  if (app.userId !== userId) throw new Error('Acesso negado. Você não é o dono deste app.');
}

export async function add(req: AuthRequest, res: Response) {
  try {
    const appId = String(req.params.appId); // Forçamos a ser string para agradar ao TypeScript
    const { key, value } = req.body;
    
    await checkAppOwnership(appId, String(req.userId));
    const env = await saveEnv(appId, key, value);
    
    res.status(201).json(env);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function list(req: AuthRequest, res: Response) {
  try {
    const appId = String(req.params.appId); // Forçamos a ser string
    
    await checkAppOwnership(appId, String(req.userId));
    const envs = await listEnvs(appId);
    
    res.json(envs);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const appId = String(req.params.appId); // Forçamos a ser string
    const envId = String(req.params.envId); // Forçamos a ser string
    
    await checkAppOwnership(appId, String(req.userId));
    await deleteEnv(envId);
    
    res.json({ message: 'Variável de ambiente eliminada com sucesso.' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}