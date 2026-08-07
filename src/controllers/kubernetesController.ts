import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolveNamespace } from "../utils/kubernetes";

const execFileAsync = promisify(execFile);

export async function getPodLogs(req: AuthRequest, res: Response) {
  try {
    const { appId } = req.params;
    const namespace = resolveNamespace(req.query.namespace as string | undefined);

    if (!appId) {
      return res.status(400).json({ error: "appId é obrigatório." });
    }

    const deploymentName = `app-${appId.slice(0, 6)}`;

    const { stdout } = await execFileAsync(
      "kubectl",
      ["logs", `deployment/${deploymentName}`, "-n", namespace, "--tail=200"],
      {
        env: process.env,
      }
    );

    return res.json({ namespace, deploymentName, logs: stdout });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: "Erro ao buscar logs do pod.", details: message });
  }
}
