import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/redis";
import { promisify } from "util";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { createDeployLog } from "../services/deployLogService";
import { runCommandWithLogs } from "../utils/runCommandWithLogs";

const execAsync = promisify(exec);
const prisma = new PrismaClient();

export const worker = new Worker(
  "DeployQueue",
  async (job: Job) => {
    const { appId, repositoryUrl, deployId } = job.data as {
      appId: string;
      repositoryUrl: string;
      deployId: string;
    };

    if (!appId || !repositoryUrl || !deployId) {
      throw new Error("Payload inválido: appId, repositoryUrl ou deployId ausente.");
    }

    const tempDeployDir = path.join(__dirname, "..", "..", "temp-deploys", appId);

    console.log(`\n[Worker] Iniciando job ${job.id} para o App: ${appId}`);
    console.log(`[Worker] Repositório alvo: ${repositoryUrl}`);

    try {
      await createDeployLog({
        deployId,
        type: "build",
        level: "info",
        message: `Worker iniciou o processamento do app ${appId}.`,
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
        message: "Status atualizado para building.",
      });

      if (fs.existsSync(tempDeployDir)) {
        await createDeployLog({
          deployId,
          type: "build",
          level: "info",
          message: "Removendo diretório residual de deploy anterior.",
        });

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
        message: `Clonando repositório: ${repositoryUrl}`,
      });

      await runCommandWithLogs({
        command: "git",
        args: ["clone", repositoryUrl, tempDeployDir],
        deployId,
        type: "build",
      });

      await createDeployLog({
        deployId,
        type: "build",
        level: "info",
        message: `Repositório clonado com sucesso em: ${tempDeployDir}`,
      });

      await createDeployLog({
        deployId,
        type: "build",
        level: "info",
        message: "Inspecionando arquivos do projeto para detectar runtime.",
      });

      let runtime: "Node" | "Python";

      const hasPackageJson = fs.existsSync(path.join(tempDeployDir, "package.json"));
      const hasRequirementsTxt = fs.existsSync(path.join(tempDeployDir, "requirements.txt"));

      if (hasPackageJson) {
        runtime = "Node";

        await createDeployLog({
          deployId,
          type: "build",
          level: "info",
          message: "Runtime detectado: Node.js.",
        });
      } else if (hasRequirementsTxt) {
        runtime = "Python";

        await createDeployLog({
          deployId,
          type: "build",
          level: "info",
          message: "Runtime detectado: Python.",
        });
      } else {
        throw new Error(
          "Runtime não suportado. Nenhum package.json ou requirements.txt foi encontrado."
        );
      }

      const containerPort = runtime === "Node" ? 5006 : 8000;

      const dockerfilePath = path.join(tempDeployDir, "Dockerfile");
      let dockerfileContent = "";

      if (runtime === "Node") {
        dockerfileContent = `
FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
ENV PORT=5006
EXPOSE 5006
CMD ["npm", "start"]
        `.trim();
      }

      if (runtime === "Python") {
        dockerfileContent = `
FROM python:3.9-slim
WORKDIR /usr/src/app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8000
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
        `.trim();
      }

      fs.writeFileSync(dockerfilePath, dockerfileContent, {
        encoding: "utf-8",
      });

      await createDeployLog({
        deployId,
        type: "build",
        level: "info",
        message: `Dockerfile gerado com sucesso para ${runtime}. Porta interna definida: ${containerPort}.`,
      });

      const imageName = `zploy-app-${appId.toLowerCase()}`;

      await createDeployLog({
        deployId,
        type: "build",
        level: "info",
        message: `Iniciando Docker Build da imagem: ${imageName}`,
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
        message: `Imagem Docker criada com sucesso: ${imageName}`,
      });

      await createDeployLog({
        deployId,
        type: "runtime",
        level: "info",
        message: "Preparando execução do container.",
      });

      const envVars = await prisma.envVar.findMany({
        where: { appId },
      });

      const envArgs = envVars.flatMap((envVar) => [
        "-e",
        `${envVar.key}=${envVar.value}`,
      ]);

      const hostPort = Math.floor(Math.random() * (40000 - 30000) + 30000);
      const containerName = `container-${appId}`;

      await createDeployLog({
        deployId,
        type: "runtime",
        level: "info",
        message: `Container será iniciado na porta externa ${hostPort}, apontando para a porta interna ${containerPort}.`,
      });

      try {
        await execAsync(`docker rm -f ${containerName}`);

        await createDeployLog({
          deployId,
          type: "runtime",
          level: "info",
          message: `Container antigo removido: ${containerName}`,
        });
      } catch {
        await createDeployLog({
          deployId,
          type: "runtime",
          level: "info",
          message: `Nenhum container antigo encontrado com o nome: ${containerName}`,
        });
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

      const appUrl = `http://localhost:${hostPort}`;

      await createDeployLog({
        deployId,
        type: "runtime",
        level: "info",
        message: `App online em: ${appUrl}`,
      });

      await prisma.app.update({
        where: { id: appId },
        data: {
          url: appUrl,
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

          await createDeployLog({
            deployId,
            type: "build",
            level: "info",
            message: "Pasta temporária removida com sucesso.",
          });
        } catch {
          await createDeployLog({
            deployId,
            type: "build",
            level: "info",
            message: "Aviso: não foi possível remover a pasta temporária.",
          });
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
          message: `Falha no deploy: ${errorMessage}`,
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