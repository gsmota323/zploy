import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import { addDeployJob } from "../queues/deployQueue";
import { createDeployLog, getDeployLogs } from "../services/deployLogService";
import { AuthRequest } from "../middlewares/authMiddleware";
import { exec, execFile } from "node:child_process";
import { promisify } from "util";



const prisma = new PrismaClient();

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);


function isValidGithubRepositoryUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      /^\/[^/]+\/[^/]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export async function startDeploy(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { repositoryUrl, dockerfile, deploymentBranch } = req.body;

        if (
      typeof repositoryUrl !== "string" ||
      !isValidGithubRepositoryUrl(repositoryUrl)
    ) {
      return res.status(400).json({
        error: "repositoryUrl deve ser um repositório GitHub válido.",
      });
    }

        if (
      deploymentBranch !== undefined &&
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
      dockerfile !== undefined &&
      (
        typeof dockerfile !== "string" ||
        dockerfile.length > 32_000
      )
    ) {
      return res.status(400).json({
        error: "Dockerfile inválido ou maior que 32 KB.",
      });
    }

    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        error: "Usuário não autenticado.",
      });
    }

    if (!repositoryUrl) {
      return res.status(400).json({
        error: "URL do repositório é obrigatória.",
      });
    }

    const app = await prisma.app.findFirst({
      where: {
        id: String(id),
        userId,
      },
    });

    if (!app) {
      return res.status(404).json({
        error: "App não encontrado.",
      });
    }

    const newDeploy = await prisma.deploy.create({
      data: {
        appId: app.id,
        status: "pending",
      },
    });

    await createDeployLog({
      deployId: newDeploy.id,
      type: "build",
      level: "info",
      message: "Deploy recebido pela API.",
    });

    await createDeployLog({
      deployId: newDeploy.id,
      type: "build",
      level: "info",
      message: "Deploy criado com status pending.",
    });

    const branchToUse = deploymentBranch?.toString().trim() || (app as { deploymentBranch?: string }).deploymentBranch || 'main';

    await prisma.app.update({
      where: {
        id: app.id,
      },
      data: {
        repositoryUrl,
        deploymentBranch: branchToUse,
        status: "pending",
      },
    });

    await addDeployJob(app.id, repositoryUrl, newDeploy.id, dockerfile, branchToUse);

    await createDeployLog({
      deployId: newDeploy.id,
      type: "build",
      level: "info",
      message: "Deploy enviado para a fila Redis.",
    });

    return res.status(202).json({
      message: "Deploy na fila!",
      deployId: newDeploy.id,
      status: newDeploy.status,
    });
  } catch (error) {
    console.error("ERRO AO INICIAR DEPLOY:", error);

    return res.status(500).json({
      error: "Erro interno ao iniciar deploy.",
      details: (error as Error).message,
    });
  }
}

export async function listarLogsDeploy(req: AuthRequest, res: Response) {
  try {
    const { deployId } = req.params;
    const deployIdParam = Array.isArray(deployId) ? deployId[0] : deployId;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        error: "Usuário não autenticado.",
      });
    }

    const deploy = await prisma.deploy.findFirst({
      where: {
        id: deployIdParam,
        app: {
          userId,
        },
      },
    });

    if (!deploy) {
      return res.status(404).json({
        error: "Deploy não encontrado.",
      });
    }

    const logs = await getDeployLogs(deployIdParam);

    return res.json(logs);
  } catch (error) {
    console.error("ERRO AO BUSCAR LOGS DO DEPLOY:", error);

    return res.status(500).json({
      error: "Erro ao buscar logs do deploy.",
      details: (error as Error).message,
    });
  }
}

export async function stopApp(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const appIdParam = Array.isArray(id) ? id[0] : id;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        error: "Usuário não autenticado.",
      });
    }

    const app = await prisma.app.findFirst({
      where: {
        id: appIdParam,
        userId,
      },
    });

    if (!app) {
      return res.status(404).json({
        error: "App não encontrado.",
      });
    }

    const containerName = `container-${app.id}`;

    const lastDeploy = await prisma.deploy.findFirst({
      where: {
        appId: app.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    try {
      await execFileAsync("docker", [
        "rm",
        "-f",
        containerName,
      ]);

      if (lastDeploy) {
        await createDeployLog({
          deployId: lastDeploy.id,
          type: "runtime",
          level: "info",
          message: `Container derrubado com sucesso: ${containerName}`,
        });
      }
    } catch (dockerError) {
      if (lastDeploy) {
        await createDeployLog({
          deployId: lastDeploy.id,
          type: "runtime",
          level: "error",
          message: `Erro ao derrubar container ${containerName}: ${(dockerError as Error).message}`,
        });
      }

      return res.status(500).json({
        error: "Erro ao derrubar container.",
        details: (dockerError as Error).message,
      });
    }

    await prisma.app.update({
      where: {
        id: app.id,
      },
      data: {
        status: "stopped",
        url: null,
      },
    });

    if (lastDeploy) {
      await prisma.deploy.update({
        where: {
          id: lastDeploy.id,
        },
        data: {
          status: "stopped",
        },
      });
    }

    return res.json({
      message: "Aplicação derrubada com sucesso.",
      appId: app.id,
      status: "stopped",
    });
  } catch (error) {
    console.error("ERRO AO DERRUBAR APP:", error);

    return res.status(500).json({
      error: "Erro interno ao derrubar app.",
      details: (error as Error).message,
    });
  }
}