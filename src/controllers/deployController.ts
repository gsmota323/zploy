import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client'; 
import { addDeployJob } from '../queues/deployQueue';

const prisma = new PrismaClient(); 

export async function startDeploy(req: Request, res: Response) {
  try {
    const { id } = req.params; 
    const { repositoryUrl } = req.body;

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