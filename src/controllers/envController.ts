import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import prisma from '../config/prisma';
import { saveEnv, listEnvs, deleteEnv } from '../services/envService';


async function checkAppOwnership(appId: string, userId: string) {
  const app = await prisma.app.findUnique({ where: { id: appId } });
  if (!app) throw new Error('Aplicativo não encontrado.');
  if (app.userId !== userId) throw new Error('Acesso negado. Você não é o dono deste app.');
}

// Nunca deixa o valor (cifrado ou não) sair pela API - apenas metadados não sensíveis.
function toPublicEnvVar(env: { id: string; key: string; appId: string }) {
  return { id: env.id, key: env.key, appId: env.appId };
}

export async function add(req: AuthRequest, res: Response) {
  try {
    const appId = String(req.params.appId); 
    const { key, value } = req.body;
    
    await checkAppOwnership(appId, String(req.userId));
    const env = await saveEnv(appId, key, value);
    
    res.status(201).json(toPublicEnvVar(env));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function list(req: AuthRequest, res: Response) {
  try {
    const appId = String(req.params.appId); 
    
    await checkAppOwnership(appId, String(req.userId));
    const envs = await listEnvs(appId);
    
    res.json(envs.map(toPublicEnvVar));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const appId = String(req.params.appId); 
    const envId = String(req.params.envId); 
    
    await checkAppOwnership(appId, String(req.userId));
    await deleteEnv(envId, appId);
    
    res.json({ message: 'Variável de ambiente eliminada com sucesso.' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}