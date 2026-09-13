import prisma from '../config/prisma';
import { normalizeRepositoryUrl } from '../utils/githubWebhook';
import { DeploymentProvider } from './deployment/deploymentProvider';
import { KubernetesProvider } from './deployment/kubernetesProvider';
import { DockerProvider } from './deployment/dockerProvider';

export async function createApp(
  name: string,
  userId: string,
  config?: {
    minReplicas?: number;
    maxReplicas?: number;
    targetCPUUtilizationPercentage?: number;
    repositoryUrl?: string;
    deploymentBranch?: string;
  }
) {
  const repositoryUrl = normalizeRepositoryUrl(config?.repositoryUrl);
  const deploymentBranch = config?.deploymentBranch?.trim() || 'main';

  return await prisma.app.create({
    data: {
      name,
      userId,
      repositoryUrl,
      deploymentBranch,
      minReplicas: config?.minReplicas ?? 1,
      maxReplicas: config?.maxReplicas ?? 3,
      targetCPUUtilizationPercentage: config?.targetCPUUtilizationPercentage ?? 70,
    },
  });
}

export async function getUserApps(userId: string) {
  // Lista apenas os apps que pertencem ao usuário logado
  return await prisma.app.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      deploys: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
}

export async function deleteApp(appId: string, userId: string) {
  // 1. Busca o app para ver se ele existe
  const app = await prisma.app.findUnique({
    where: { id: appId },
    include: {
      deploys: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          deployLogs: {
            where: { type: 'runtime' },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      },
    },
  });

  if (!app) {
    throw new Error('Aplicativo não encontrado.');
  }

  // 2. Trava de Segurança: O app pertence a quem está tentando deletar?
  if (app.userId !== userId) {
    throw new Error('Acesso negado. Você não é o dono deste app.');
  }

  // 3. Limpeza de infraestrutura (Runtime) via DeploymentProvider
  const lastDeploy = app.deploys[0];

  const isKubernetes =
    lastDeploy?.deployLogs.some((log) => log.message.includes("Kubernetes")) ||
    (app.url ? !app.url.includes("localhost:") : false) ||
    process.env.REQUIRE_KUBERNETES === "true";

  const provider: DeploymentProvider = isKubernetes
    ? new KubernetesProvider()
    : new DockerProvider();

  try {
    await provider.remove(appId);
    console.log(`[ZPLOY] Recursos de infraestrutura (${isKubernetes ? "Kubernetes" : "Docker"}) do app ${appId} removidos.`);
  } catch (error) {
    console.warn(`[ZPLOY] Erro ao remover recursos do app ${appId}. Seguindo...`, error);
  }

  // 4. Deleta do banco
  return await prisma.app.delete({
    where: { id: appId }
  });
}