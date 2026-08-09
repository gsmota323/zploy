import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import { execFile } from "child_process";
import { promisify } from "util";
import { AuthRequest } from "../middlewares/authMiddleware";
import {
  buildDeploymentName,
  resolveNamespace,
  summarizeKubernetesHealth,
} from "../utils/kubernetes";

const prisma = new PrismaClient();
const execFileAsync = promisify(execFile);

function normalizeTail(value: string | undefined) {
  const parsed = Number(value ?? "200");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 200;
  }

  return Math.min(parsed, 1000);
}

async function getPodInfo(app: { id: string; name: string; userId: string }, namespace: string) {
  const deploymentName = buildDeploymentName(app.name, app.id);

  try {
    const podList = await execFileAsync(
      "kubectl",
      [
        "get",
        "pods",
        "-n",
        namespace,
        "-l",
        `app=${deploymentName}`,
        "-o",
        "jsonpath={.items[0].metadata.name}",
      ],
      {
        env: process.env,
      }
    );

    const podName = podList.stdout.trim();

    if (!podName) {
      return {
        deploymentName,
        podName: null,
        ready: false,
        status: "not-found",
        replicas: 0,
        availableReplicas: 0,
        unavailableReplicas: 0,
      };
    }

    const statusOutput = await execFileAsync(
      "kubectl",
      ["get", "pod", podName, "-n", namespace, "-o", "jsonpath={.status.phase}"],
      {
        env: process.env,
      }
    );

    const deploymentStatusOutput = await execFileAsync(
      "kubectl",
      [
        "get",
        "deployment",
        deploymentName,
        "-n",
        namespace,
        "-o",
        "jsonpath={.status.readyReplicas},{.status.availableReplicas},{.status.unavailableReplicas},{.spec.replicas}",
      ],
      {
        env: process.env,
      }
    );

    const [readyReplicas = "0", availableReplicas = "0", unavailableReplicas = "0", replicas = "0"] =
      String(deploymentStatusOutput.stdout || "0,0,0,0")
        .split(",")
        .map((value) => value.trim());

    return {
      deploymentName,
      podName,
      ready: statusOutput.stdout.trim() === "Running",
      status: statusOutput.stdout.trim() || "unknown",
      replicas: Number(replicas || 0),
      availableReplicas: Number(availableReplicas || 0),
      unavailableReplicas: Number(unavailableReplicas || 0),
      readyReplicas: Number(readyReplicas || 0),
    };
  } catch {
    return {
      deploymentName,
      podName: null,
      ready: false,
      status: "not-found",
      replicas: 0,
      availableReplicas: 0,
      unavailableReplicas: 0,
      readyReplicas: 0,
    };
  }
}

export async function getPodLogs(req: AuthRequest, res: Response) {
  try {
    const { appId } = req.params;
    const namespace = resolveNamespace(req.query.namespace as string | undefined);
    const userId = req.userId;
    const tail = normalizeTail(req.query.tail as string | undefined);

    if (!appId) {
      return res.status(400).json({ error: "appId é obrigatório." });
    }

    if (!userId) {
      return res.status(401).json({ error: "Usuário não autenticado." });
    }

    const app = await prisma.app.findFirst({
      where: {
        id: String(appId),
        userId,
      },
    });

    if (!app) {
      return res.status(404).json({ error: "App não encontrado." });
    }

    const podInfo = await getPodInfo(app, namespace);
    const deploymentName = podInfo.deploymentName;

    let podName = podInfo.podName || "";
    let source: "pod" | "deployment" = "pod";
    let logs = "";

    if (podName) {
      const result = await execFileAsync(
        "kubectl",
        ["logs", `pod/${podName}`, "-n", namespace, `--tail=${tail}`],
        {
          env: process.env,
        }
      );

      logs = result.stdout;
    } else {
      source = "deployment";
      const result = await execFileAsync(
        "kubectl",
        ["logs", `deployment/${deploymentName}`, "-n", namespace, `--tail=${tail}`],
        {
          env: process.env,
        }
      );

      logs = result.stdout;
    }

    return res.json({
      success: true,
      namespace,
      deploymentName,
      podName,
      source,
      status: podInfo.status,
      ready: podInfo.ready,
      logs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: "Erro ao buscar logs do pod.", details: message });
  }
}

export async function getPodStatus(req: AuthRequest, res: Response) {
  try {
    const { appId } = req.params;
    const namespace = resolveNamespace(req.query.namespace as string | undefined);
    const userId = req.userId;

    if (!appId) {
      return res.status(400).json({ error: "appId é obrigatório." });
    }

    if (!userId) {
      return res.status(401).json({ error: "Usuário não autenticado." });
    }

    const app = await prisma.app.findFirst({
      where: {
        id: String(appId),
        userId,
      },
    });

    if (!app) {
      return res.status(404).json({ error: "App não encontrado." });
    }

    const podInfo = await getPodInfo(app, namespace);
    const health = summarizeKubernetesHealth({
      ready: podInfo.ready,
      status: podInfo.status,
      replicas: podInfo.replicas,
      availableReplicas: podInfo.availableReplicas,
      unavailableReplicas: podInfo.unavailableReplicas,
    });

    return res.json({
      success: true,
      namespace,
      appId: app.id,
      deploymentName: podInfo.deploymentName,
      podName: podInfo.podName,
      status: podInfo.status,
      ready: podInfo.ready,
      health,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: "Erro ao consultar status do pod.", details: message });
  }
}
