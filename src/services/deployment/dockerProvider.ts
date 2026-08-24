// src/services/deployment/dockerProvider.ts

import { execFile } from "child_process";
import { promisify } from "util";
import { DeploymentProvider, DeploymentConfig, DeploymentResult } from "./deploymentProvider";
import { createDeployLog } from "../deployLogService";
import { runCommandWithLogs } from "../../utils/runCommandWithLogs";

const execFileAsync = promisify(execFile);

export class DockerProvider implements DeploymentProvider {
  
  async deploy(config: DeploymentConfig): Promise<DeploymentResult> {
    const envArgs = config.envVars.flatMap((envVar) => [
      "-e",
      `${envVar.key}=${envVar.value}`,
    ]);

    const hostPort = Math.floor(Math.random() * (40000 - 30000) + 30000);
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

    // 2. Roda o novo container
    await runCommandWithLogs({
      command: "docker",
      args: [
        "run",
        "-d",
        ...envArgs,
        "-e",
        `PORT=${config.containerPort}`,
        "-p",
        `${hostPort}:${config.containerPort}`,
        "--name",
        containerName,
        config.imageName,
      ],
      deployId: config.deployId,
      type: "runtime",
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