import { Response, Request } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { createApp, getUserApps, deleteApp } from '../services/appService';
import { addDeployJob } from '../queues/deployQueue';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function create(req: AuthRequest, res: Response) {
  try {
    const { name } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    const app = await createApp(name, String(userId));
    res.status(201).json(app);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar app. O nome já pode estar em uso.' });
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

export async function startDeploy(req: Request, res: Response) {
  try {
    const { id } = req.params; // appId
    const { repositoryUrl } = req.body;

    if (!repositoryUrl) {
      return res.status(400).json({ error: "O link do repositório é obrigatório." });
    }

    // Identificar o appId de forma segura
    const appId = Array.isArray(id) ? id[0] : id;

    // 1. CRIAR E ARMAZENAR: Aqui salvamos o resultado na variável 'newDeploy'
    const newDeploy = await prisma.deploy.create({
      data: {
        appId: appId,
        status: 'pending'
      }
    });

    // 2. USAR: Agora 'newDeploy' existe e tem o seu .id
    const job = await addDeployJob(appId, repositoryUrl, newDeploy.id);

    return res.status(202).json({
      message: "Deploy na fila!",
      deployId: newDeploy.id,
      jobId: job.id
    });
  } catch (error) {
    console.error("Erro ao enviar deploy para a fila:", error);
    return res.status(500).json({ error: "Erro interno no servidor." });
  }
}