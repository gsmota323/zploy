import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { createApp, getUserApps, deleteApp } from '../services/appService';


export async function create(req: AuthRequest, res: Response) {
  try {
    const { name } = req.body;
    const userId = req.userId; // Vem do nosso middleware de autenticação!

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    const app = await createApp(name, String(userId));
    res.status(201).json(app);
  } catch (error) {
    // Se o erro for o nome duplicado que travamos no schema, avisamos o usuário
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
    const appId = String(req.params.id); // Pegamos o ID da URL (ex: /apps/123)
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