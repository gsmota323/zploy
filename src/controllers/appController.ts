import { Response, Request } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { createApp, getUserApps, deleteApp } from '../services/appService';
import { addDeployJob } from '../queues/deployQueue';
import { PrismaClient } from '@prisma/client';
import { normalizeRepositoryUrl } from '../utils/githubWebhook';

const prisma = new PrismaClient();

export async function create(req: AuthRequest, res: Response) {
  try {
    const { name, repositoryUrl, deploymentBranch, minReplicas, maxReplicas, targetCPUUtilizationPercentage } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    const app = await createApp(name, String(userId), {
      repositoryUrl,
      deploymentBranch,
      minReplicas,
      maxReplicas,
      targetCPUUtilizationPercentage,
    });
    res.status(201).json(app);
  } catch (error: any) {
    // 1. Mostra o erro real no teu terminal (servidor)
    console.error("ERRO NO CREATE APP:", error);

    // 2. Retorna o erro real ou uma mensagem mais informativa para o usuário
    res.status(400).json({ 
        error: 'Erro ao criar app.', 
        details: error.message || 'Erro desconhecido' 
    });
  }
}

export async function list(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    const apps = await getUserApps(String(userId));
    res.json(apps);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar aplicativos.' });
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const appId = String(req.params.id);
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    await deleteApp(appId, String(userId));
    
    res.json({ message: 'App deletado com sucesso e todos os recursos limpos!' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function redeployLast(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const appId = Array.isArray(id) ? id[0] : id;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    const app = await prisma.app.findFirst({
      where: { id: appId, userId },
    });

    if (!app) {
      return res.status(404).json({ error: 'Aplicativo não encontrado.' });
    }

    if (!app.repositoryUrl) {
      return res.status(400).json({ error: 'Este app não possui um repositório associado.' });
    }

    const newDeploy = await prisma.deploy.create({
      data: {
        appId: app.id,
        status: 'pending',
      },
    });

    await prisma.app.update({
      where: { id: app.id },
      data: { status: 'pending' },
    });

    const job = await addDeployJob(app.id, app.repositoryUrl, newDeploy.id, undefined, (app as { deploymentBranch?: string }).deploymentBranch || 'main');

    return res.status(202).json({
      message: 'Deploy reexecutado com sucesso!',
      deployId: newDeploy.id,
      jobId: job.id,
      branch: (app as { deploymentBranch?: string }).deploymentBranch || 'main',
    });
  } catch (error) {
    console.error('Erro ao reexecutar deploy:', error);
    return res.status(500).json({ error: 'Erro interno ao reexecutar deploy.' });
  }
}
