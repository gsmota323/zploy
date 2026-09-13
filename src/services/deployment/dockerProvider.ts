// src/services/deployment/dockerProvider.ts

import { execFile } from "child_process";
import { promisify } from "util";
import { DeploymentProvider, DeploymentConfig, DeploymentResult } from "./deploymentProvider";
import { createDeployLog } from "../deployLogService";
import { runCommandWithLogs } from "../../utils/runCommandWithLogs";
import { selectAvailableHostPort } from "./dockerPortAllocator";

const execFileAsync = promisify(execFile);

export class DockerProvider implements DeploymentProvider {
  
  async deploy(config: DeploymentConfig): Promise<DeploymentResult> {
    const envArgs = config.envVars.flatMap((envVar) => [
      "-e",
      `${envVar.key}=${envVar.value}`,
    ]);

    const containerName = `zploy-${config.appId}`;

    // 1. Limpa o container antigo
    try {
      await execFileAsync("docker", ["rm", "-f", containerName]);
      await createDeployLog({
        deployId: config.deployId,
        type: "runtime",
        level: "info",
        message: "Versão anterior da aplicação (Docker) encerrada.",
      });
    } catch {
      // Ignora se não existir
    }

    // 2. Roda o novo container, tentando outra porta host se a escolhida já estiver ocupada.
    const hostPort = await selectAvailableHostPort(async (candidatePort) => {
      try {
        await runCommandWithLogs({
          command: "docker",
          args: [
            "run",
            "-d",
            ...envArgs,
            "-e",
            `PORT=${config.containerPort}`,
            "-p",
            `${candidatePort}:${config.containerPort}`,
            "--name",
            containerName,
            config.imageName,
          ],
          deployId: config.deployId,
          type: "runtime",
        });
      } catch (error) {
        // O container pode ficar criado (porém não iniciado) quando o bind da porta falha;
        // remove para permitir uma nova tentativa com o mesmo --name.
        try {
          await execFileAsync("docker", ["rm", "-f", containerName]);
        } catch {
          // ignora
        }

        throw error;
      }
    });

    const appUrl = `http://localhost:${hostPort}`;

    return {
      url: appUrl,
      runtime: "Docker",
      porta: hostPort,
    };
  }

  async stop(appId: string): Promise<void> {
    const containerName = `zploy-${appId}`;
    try {
      await execFileAsync("docker", ["stop", containerName]);
    } catch (error) {
      console.warn(`[DockerProvider] Falha ao parar container ${containerName}`);
    }
  }

  async remove(appId: string): Promise<void> {
    const containerName = `zploy-${appId}`;
    try {
      await execFileAsync("docker", ["rm", "-f", containerName]);
    } catch (error) {
      console.warn(`[DockerProvider] Falha ao remover container ${containerName}`);
    }
  }
}