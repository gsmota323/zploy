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

        if (
      typeof name !== "string" ||
      name.trim().length < 1 ||
      name.trim().length > 50 ||
      !/^[a-zA-Z0-9_-]+$/.test(name)
    ) {
      return res.status(400).json({
        error: "Nome do app inválido.",
      });
    }

        if (
      repositoryUrl !== undefined &&
      repositoryUrl !== null &&
      (
        typeof repositoryUrl !== "string" ||
        repositoryUrl.length > 500
      )
    ) {
      return res.status(400).json({
        error: "repositoryUrl inválida.",
      });
    }

        if (
      deploymentBranch !== undefined &&
      deploymentBranch !== null &&
      (
        typeof deploymentBranch !== "string" ||
        deploymentBranch.length < 1 ||
        deploymentBranch.length > 100 ||
        !/^[a-zA-Z0-9._/-]+$/.test(deploymentBranch)
      )
    ) {
      return res.status(400).json({
        error: "deploymentBranch inválida.",
      });
    }

        if (
      minReplicas !== undefined &&
      (
        !Number.isInteger(minReplicas) ||
        minReplicas < 1 ||
        minReplicas > 20
      )
    ) {
      return res.status(400).json({
        error: "minReplicas deve ser um número inteiro entre 1 e 20.",
      });
    }

        if (
      maxReplicas !== undefined &&
      (
        !Number.isInteger(maxReplicas) ||
        maxReplicas < 1 ||
        maxReplicas > 50
      )
    ) {
      return res.status(400).json({
        error: "maxReplicas deve ser um número inteiro entre 1 e 50.",
      });
    }

            if (
          minReplicas !== undefined &&
          maxReplicas !== undefined &&
          minReplicas > maxReplicas
        ) {
          return res.status(400).json({
            error: "minReplicas não pode ser maior que maxReplicas.",
          });
        }

        if (
      targetCPUUtilizationPercentage !== undefined &&
      (
        !Number.isInteger(targetCPUUtilizationPercentage) ||
        targetCPUUtilizationPercentage < 1 ||
        targetCPUUtilizationPercentage > 100
      )
    ) {
      return res.status(400).json({
        error: "targetCPUUtilizationPercentage deve estar entre 1 e 100.",
      });
    }

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
        details: (error as Error).message || 'Erro desconhecido' 
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
