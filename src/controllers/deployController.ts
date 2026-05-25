import { Request, Response } from 'express';
// 1. Importe o Prisma de onde você o instanciou ou crie uma instância local
import { PrismaClient } from '@prisma/client'; 
import { addDeployJob } from '../queues/deployQueue';

const prisma = new PrismaClient(); // A instância que resolve o erro 'Cannot find prisma'

export async function startDeploy(req: Request, res: Response) {
  try {
    const { id } = req.params; 
    const { repositoryUrl } = req.body;

    // 2. Agora o 'newDeploy' vai ser reconhecido pois está declarado nesta função
    const newDeploy = await prisma.deploy.create({
        data: {
            appId: String(id),
            status: 'pending'
        }
    });

    const job = await addDeployJob(String(id), repositoryUrl, newDeploy.id);

    return res.status(202).json({
      message: "Deploy na fila!",
      deployId: newDeploy.id
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro interno." });
  }
}