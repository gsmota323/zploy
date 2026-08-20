import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/redis";
import { promisify } from "util";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { createDeployLog } from "../services/deployLogService";
import { runCommandWithLogs } from "../utils/runCommandWithLogs";
import { deployToKubernetes } from "../utils/kubernetes";
import { inferContainerPort, resolveDockerfileContent } from "../utils/dockerfile";

const execAsync = promisify(exec);
const prisma = new PrismaClient();

export const worker = new Worker(
  "DeployQueue",
  async (job: Job) => {
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

    const tempDeployDir = path.join(__dirname, "..", "..", "temp-deploys", appId);

    const app = await prisma.app.findUnique({ where: { id: appId } });
    const targetBranch = branch || (app as { deploymentBranch?: string } | null)?.deploymentBranch || "main";

    console.log(`\n[Worker] Iniciando job ${job.id} para o App: ${appId}`);
    console.log(`[Worker] Repositório alvo: ${repositoryUrl}`);
    console.log(`[Worker] Branch alvo: ${targetBranch}`);
    console.log(`[Worker] Diretório temporário: ${tempDeployDir}`);

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

      const cloneArgs = targetBranch && targetBranch !== "main"
        ? ["clone", "--branch", targetBranch, "--single-branch", repositoryUrl, tempDeployDir]
        : ["clone", repositoryUrl, tempDeployDir];

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

      const imageName = `zploy-app-${appId.toLowerCase()}`;

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

      const envVars = await prisma.envVar.findMany({
        where: { appId },
      });

      let appUrl = "";
      let deploymentSucceeded = false;
      let hostPort = 0;
      const requireKubernetes = process.env.REQUIRE_KUBERNETES === "true";

      try {
        const k8sResult = await deployToKubernetes({
          appId,
          appName: app?.name || "app",
          imageName,
          containerPort,
          envVars: envVars.map((envVar) => ({ key: envVar.key, value: envVar.value })),
          deployId,
          minReplicas: app?.minReplicas ?? Number(process.env.KUBERNETES_MIN_REPLICAS ?? 1),
          maxReplicas: app?.maxReplicas ?? Number(process.env.KUBERNETES_MAX_REPLICAS ?? 3),
          targetCPUUtilizationPercentage:
            app?.targetCPUUtilizationPercentage ?? Number(process.env.KUBERNETES_CPU_TARGET ?? 70),
        });

        appUrl = k8sResult.url || "http://127.0.0.1";
        deploymentSucceeded = true;

        await createDeployLog({
          deployId,
          type: "runtime",
          level: "info",
          message: `Aplicação publicada no Kubernetes: ${appUrl}`,
        });
      } catch (k8sError) {
        if (requireKubernetes) {
          const reason = k8sError instanceof Error ? k8sError.message : String(k8sError);
          throw new Error(`Kubernetes obrigatório, mas indisponível: ${reason}`);
        }

        console.warn("[Worker] Kubernetes indisponível, usando fallback com Docker:", k8sError);

        const envArgs = envVars.flatMap((envVar) => [
          "-e",
          `${envVar.key}=${envVar.value}`,
        ]);

        hostPort = Math.floor(Math.random() * (40000 - 30000) + 30000);
        const containerName = `container-${appId}`;

        console.log(`[Worker] Container: ${containerName}`);
        console.log(`[Worker] Porta externa: ${hostPort}`);
        console.log(`[Worker] Porta interna: ${containerPort}`);

        try {
          await execAsync(`docker rm -f ${containerName}`);
          console.log(`[Worker] Container anterior removido: ${containerName}`);

          await createDeployLog({
            deployId,
            type: "runtime",
            level: "info",
            message: "Versão anterior da aplicação encerrada.",
          });
        } catch {
          console.log(`[Worker] Nenhum container anterior encontrado: ${containerName}`);
        }

        await runCommandWithLogs({
          command: "docker",
          args: [
            "run",
            "-d",
            ...envArgs,
            "-e",
            `PORT=${containerPort}`,
            "-p",
            `${hostPort}:${containerPort}`,
            "--name",
            containerName,
            imageName,
          ],
          deployId,
          type: "runtime",
        });

        appUrl = `http://localhost:${hostPort}`;

        await createDeployLog({
          deployId,
          type: "runtime",
          level: "info",
          message: `Aplicação online em: ${appUrl}`,
        });
      }

      await prisma.app.update({
        where: { id: appId },
        data: {
          url: appUrl,
          repositoryUrl,
          status: deploymentSucceeded ? "running" : "running",
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
      console.log(`🌐 [Worker] App online em: ${appUrl}`);

      return {
        status: "sucesso",
        porta: hostPort,
        runtime,
        url: appUrl,
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