import { Worker, Job, DelayedError } from "bullmq";
import { redisConnection } from "../config/redis";
import { promisify } from "util";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import prisma from "../config/prisma";
import { createDeployLog } from "../services/deployLogService";
import { runCommandWithLogs } from "../utils/runCommandWithLogs";
import { inferContainerPort, resolveDockerfileContent } from "../utils/dockerfile";

// --- NOVOS IMPORTS DA ARQUITETURA ---
import { DockerProvider } from "../services/deployment/dockerProvider";
import { KubernetesProvider } from "../services/deployment/kubernetesProvider";
import { DeploymentConfig } from "../services/deployment/deploymentProvider";
import {
  createLockToken,
  deployLockManager,
  DEPLOY_LOCK_TTL_MS,
  DEPLOY_LOCK_RENEW_INTERVAL_MS,
  DEPLOY_LOCK_RETRY_DELAY_MS,
} from "../utils/deployLock";
import { decryptEnvValue } from "../utils/envCrypto";
import { writeWorkerHeartbeat, WORKER_HEALTH_INTERVAL_MS } from "../utils/workerHealth";

const execFileAsync = promisify(execFile);

export const worker = new Worker(
  "DeployQueue",
  async (job: Job, token?: string) => {
    const { appId, repositoryUrl, deployId, dockerfile, branch } = job.data as {
      appId: string;
      repositoryUrl: string;
      deployId: string;
      dockerfile?: string;
      branch?: string;
    };

    if (!appId || !repositoryUrl || !deployId) {
      throw new Error("Payload inválido: appId, repositoryUrl ou deployId ausente.");
    }

    const deployRecord = await prisma.deploy.findUnique({
      where: { id: deployId },
      select: { id: true, appId: true },
    });

    if (!deployRecord) {
      console.warn(`[Worker] Job ${job.id} ignorado: deploy ${deployId} não existe mais.`);
      return { status: "skipped", reason: "deploy-not-found" };
    }

    if (deployRecord.appId !== appId) {
      console.warn(
        `[Worker] Job ${job.id} ignorado: deploy ${deployId} pertence a outro app.`
      );
      return { status: "skipped", reason: "deploy-app-mismatch" };
    }

    const tempDeployDir = path.join(__dirname, "..", "..", "temp-deploys", deployId);

    const app = await prisma.app.findUnique({ where: { id: appId } });
    const targetBranch = branch || (app as { deploymentBranch?: string } | null)?.deploymentBranch || "main";

    console.log(`\n[Worker] Iniciando job ${job.id} para o App: ${appId}`);
    console.log(`[Worker] Repositório alvo: ${repositoryUrl}`);
    console.log(`[Worker] Branch alvo: ${targetBranch}`);
    console.log(`[Worker] Diretório temporário: ${tempDeployDir}`);

    // Lock distribuído por appId: evita que dois deploys da mesma app rodem ao mesmo tempo,
    // mesmo com múltiplos processos/réplicas do worker (o BullMQ concurrency não cobre isso).
    const lockToken = createLockToken();
    let lockAcquired = false;

    try {
      lockAcquired = await deployLockManager.acquire(appId, lockToken, DEPLOY_LOCK_TTL_MS);
    } catch (lockError) {
      const reason = lockError instanceof Error ? lockError.message : String(lockError);
      console.error(`[Worker] Falha ao consultar lock de deploy do app ${appId}: ${reason}`);

      try {
        await createDeployLog({
          deployId,
          type: "build",
          level: "error",
          message: `Falha ao adquirir lock de deploy: ${reason}`,
        });
        await prisma.deploy.update({ where: { id: deployId }, data: { status: "failed" } });
        await prisma.app.update({ where: { id: appId }, data: { status: "failed" } });
      } catch (dbError) {
        console.error("[Worker] Não foi possível registrar falha de lock no banco:", dbError);
      }

      throw lockError;
    }

    if (!lockAcquired) {
      console.log(
        `[Worker] App ${appId} já possui um deploy em andamento. Reagendando job ${job.id}.`
      );

      // Não é uma falha: apenas reagenda o job (skipAttempt=true) para tentar novamente em breve,
      // sem consumir tentativas de retry e sem marcar o deploy como failed.
      await job.moveToDelayed(Date.now() + DEPLOY_LOCK_RETRY_DELAY_MS, token);
      throw new DelayedError();
    }

    const lockRenewInterval = setInterval(() => {
      deployLockManager.renew(appId, lockToken, DEPLOY_LOCK_TTL_MS).then((renewed) => {
        if (!renewed) {
          console.warn(
            `[Worker] Não foi possível renovar o lock de deploy do app ${appId} (job ${job.id}).`
          );
        }
      }).catch((renewError) => {
        console.warn(`[Worker] Erro ao renovar lock de deploy do app ${appId}:`, renewError);
      });
    }, DEPLOY_LOCK_RENEW_INTERVAL_MS);

    try {
      await createDeployLog({
        deployId,
        type: "build",
        level: "info",
        message: "Deploy iniciado.",
      });

      await prisma.deploy.update({
        where: { id: deployId },
        data: { status: "building" },
      });

      await prisma.app.update({
        where: { id: appId },
        data: { status: "building" },
      });

      await createDeployLog({
        deployId,
        type: "build",
        level: "info",
        message: "Preparando ambiente para o deploy.",
      });

      if (fs.existsSync(tempDeployDir)) {
        console.log("[Worker] Removendo diretório temporário antigo...");
        fs.rmSync(tempDeployDir, {
          recursive: true,
          force: true,
        });
      }

      fs.mkdirSync(tempDeployDir, {
        recursive: true,
      });

      await createDeployLog({
        deployId,
        type: "build",
        level: "info",
        message: "Baixando código do repositório.",
      });

      const cloneArgs = [
        "clone",
        "--branch",
        targetBranch,
        "--single-branch",
        // "--" impede que um repositoryUrl iniciado por "-" seja interpretado como opção do git.
        "--",
        repositoryUrl,
        tempDeployDir,
      ];
      
      await runCommandWithLogs({
        command: "git",
        args: cloneArgs,
        deployId,
        type: "build",
      });

      await createDeployLog({
        deployId,
        type: "build",
        level: "info",
        message: "Código do repositório baixado com sucesso.",
      });

      await createDeployLog({
        deployId,
        type: "build",
        level: "info",
        message: "Detectando tecnologia do projeto.",
      });

      let runtime: "Node" | "Python";

      const hasPackageJson = fs.existsSync(path.join(tempDeployDir, "package.json"));
      const hasRequirementsTxt = fs.existsSync(path.join(tempDeployDir, "requirements.txt"));
      const dockerfilePathInRepo = path.join(tempDeployDir, "Dockerfile");
      const hasRepositoryDockerfile = fs.existsSync(dockerfilePathInRepo);
      const repositoryDockerfileContent = hasRepositoryDockerfile
        ? fs.readFileSync(dockerfilePathInRepo, { encoding: "utf-8" })
        : undefined;

      if (hasPackageJson) {
        runtime = "Node";

        await createDeployLog({
          deployId,
          type: "build",
          level: "info",
          message: "Projeto Node.js detectado.",
        });
      } else if (hasRequirementsTxt) {
        runtime = "Python";

        await createDeployLog({
          deployId,
          type: "build",
          level: "info",
          message: "Projeto Python detectado.",
        });
      } else if (repositoryDockerfileContent) {
        runtime = repositoryDockerfileContent.toLowerCase().includes("python") ? "Python" : "Node";

        await createDeployLog({
          deployId,
          type: "build",
          level: "info",
          message: "Projeto sem package.json/requirements.txt, usando Dockerfile do repositório.",
        });
      } else {
        throw new Error(
          "Não foi possível identificar a tecnologia do projeto. Envie um projeto Node.js com package.json ou Python com requirements.txt."
        );
      }

      const customDockerfileInput = dockerfile?.trim();
      const shouldUseRepositoryDockerfile = !customDockerfileInput && Boolean(repositoryDockerfileContent);

      if (customDockerfileInput) {
        await createDeployLog({
          deployId,
          type: "build",
          level: "info",
          message: "Usando Dockerfile customizado informado no deploy.",
        });
      } else if (shouldUseRepositoryDockerfile) {
        await createDeployLog({
          deployId,
          type: "build",
          level: "info",
          message: "Dockerfile encontrado no repositório. Usando este arquivo para build.",
        });
      }

      const dockerfileContent = resolveDockerfileContent({
        runtime,
        customDockerfile: customDockerfileInput || repositoryDockerfileContent,
      });
      const containerPort = inferContainerPort(dockerfileContent, runtime);

      await createDeployLog({
        deployId,
        type: "build",
        level: "info",
        message: "Preparando ambiente de execução.",
      });

      const dockerfilePath = path.join(tempDeployDir, "Dockerfile");
      fs.writeFileSync(dockerfilePath, dockerfileContent, {
        encoding: "utf-8",
      });

      console.log(`[Worker] Dockerfile gerado em: ${dockerfilePath}`);
      console.log(`[Worker] Porta interna definida: ${containerPort}`);

      await createDeployLog({
        deployId,
        type: "build",
        level: "info",
        message: "Ambiente de execução preparado com sucesso.",
      });

      const imageTag = deployId.substring(0, 7); 
      const imageName = `zploy-app-${appId.toLowerCase()}:${imageTag}`;

      await createDeployLog({
        deployId,
        type: "build",
        level: "info",
        message: "Construindo aplicação.",
      });

      await runCommandWithLogs({
        command: "docker",
        args: ["build", "-t", imageName, tempDeployDir],
        deployId,
        type: "build",
      });

      await createDeployLog({
        deployId,
        type: "build",
        level: "info",
        message: "Aplicação construída com sucesso.",
      });

      await createDeployLog({
        deployId,
        type: "runtime",
        level: "info",
        message: "Iniciando aplicação.",
      });

      // ---------------------------------------------------------
      // FASE DE DEPLOY (A MÁGICA DA ARQUITETURA ACONTECE AQUI)
      // ---------------------------------------------------------
      const envVars = await prisma.envVar.findMany({ where: { appId } });
      const requireKubernetes = process.env.REQUIRE_KUBERNETES === "true";

      const deployConfig: DeploymentConfig = {
        appId,
        appName: app?.name || "app",
        imageName,
        containerPort,
        deployId,
        // Descriptografa somente aqui, no momento em que o container/Deployment precisa dos valores reais.
        envVars: envVars.map(e => ({ key: e.key, value: decryptEnvValue(e.value) })),
        minReplicas: app?.minReplicas ?? Number(process.env.KUBERNETES_MIN_REPLICAS ?? 1),
        maxReplicas: app?.maxReplicas ?? Number(process.env.KUBERNETES_MAX_REPLICAS ?? 3),
        targetCPUUtilizationPercentage: app?.targetCPUUtilizationPercentage ?? Number(process.env.KUBERNETES_CPU_TARGET ?? 70),
      };

      let deployResult;

      try {
        const k8sProvider = new KubernetesProvider();
        deployResult = await k8sProvider.deploy(deployConfig);
        
        await createDeployLog({
          deployId,
          type: "runtime",
          level: "info",
          message: `Aplicação publicada no Kubernetes: ${deployResult.url}`,
        });
      } catch (k8sError) {
        if (requireKubernetes) {
          const reason = k8sError instanceof Error ? k8sError.message : String(k8sError);
          throw new Error(`Kubernetes obrigatório, mas indisponível: ${reason}`);
        }

        console.warn("[Worker] Kubernetes falhou/indisponível. Iniciando fallback via DockerProvider.", k8sError);
        
        const dockerProvider = new DockerProvider();
        deployResult = await dockerProvider.deploy(deployConfig);

        await createDeployLog({
          deployId,
          type: "runtime",
          level: "info",
          message: `Aplicação online em Docker: ${deployResult.url}`,
        });
      }

      // ---------------------------------------------------------
      // ATUALIZAÇÃO DE STATUS E LIMPEZA
      // ---------------------------------------------------------
      await prisma.app.update({
        where: { id: appId },
        data: {
          url: deployResult.url,
          repositoryUrl,
          status: "running",
        },
      });

      await prisma.deploy.update({
        where: { id: deployId },
        data: {
          status: "running",
        },
      });

      await createDeployLog({
        deployId,
        type: "runtime",
        level: "info",
        message: "Deploy finalizado com sucesso.",
      });

      if (fs.existsSync(tempDeployDir)) {
        try {
          fs.rmSync(tempDeployDir, {
            recursive: true,
            force: true,
          });

          console.log("[Worker] Pasta temporária removida com sucesso.");
        } catch {
          console.warn("[Worker] Não foi possível remover a pasta temporária.");
        }
      }

      console.log(`🚀 [Worker] Deploy concluído!`);
      console.log(`🌐 [Worker] App online em: ${deployResult.url}`);

      return {
        status: "sucesso",
        porta: deployResult.porta || 80, // O K8s pode não retornar porta, então usamos um padrão
        runtime: deployResult.runtime,
        url: deployResult.url,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;

      console.error(`[Worker] Falha na operação de deploy: ${errorMessage}`);

      try {
        await createDeployLog({
          deployId,
          type: "build",
          level: "error",
          message: `Deploy falhou: ${errorMessage}`,
        });

        await prisma.deploy.update({
          where: { id: deployId },
          data: { status: "failed" },
        });

        await prisma.app.update({
          where: { id: appId },
          data: { status: "failed" },
        });
      } catch (dbError) {
        console.error("[Worker] Não foi possível registrar falha no banco:", dbError);
      }

      if (fs.existsSync(tempDeployDir)) {
        fs.rmSync(tempDeployDir, {
          recursive: true,
          force: true,
        });
      }

      throw new Error(`Falha no processamento: ${errorMessage}`);
    } finally {
      // Sempre libera o lock e para a renovação, mesmo em caso de sucesso, erro ou timeout.
      clearInterval(lockRenewInterval);

      try {
        await deployLockManager.release(appId, lockToken);
      } catch (releaseError) {
        console.warn(`[Worker] Falha ao liberar lock de deploy do app ${appId}:`, releaseError);
      }
    }
  },
  {
    connection: redisConnection,
  }
);

worker.on("completed", (job, returnvalue) => {
  console.log(
    `🟢 [BullMQ] Job ${job.id} concluído. App rodando na porta ${returnvalue?.porta}.`
  );
});

worker.on("failed", (job, err) => {
  console.log(`🔴 [BullMQ] Job ${job?.id} falhou. Motivo: ${err.message}`);
});

// Heartbeat em arquivo para healthcheck do container (não abre porta/servidor HTTP no worker).
function reportWorkerHealth() {
  const redisStatus = redisConnection.status;
  writeWorkerHeartbeat({
    status: redisStatus === "ready" ? "ok" : "error",
    redisStatus,
    message: redisStatus === "ready" ? undefined : `Conexão Redis em estado "${redisStatus}".`,
  });
}

reportWorkerHealth();
setInterval(reportWorkerHealth, WORKER_HEALTH_INTERVAL_MS);