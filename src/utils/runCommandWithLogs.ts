import { spawn } from "child_process";
import { createDeployLog } from "../services/deployLogService";

type RunCommandWithLogsParams = {
  command: string;
  args: string[];
  cwd?: string;
  deployId: string;
  type?: "build" | "runtime";
};

export function runCommandWithLogs({
  command,
  args,
  cwd,
  deployId,
  type = "build",
}: RunCommandWithLogsParams): Promise<void> {
  return new Promise((resolve, reject) => {
    const pendingWrites: Promise<unknown>[] = [];
    let stderrTail = "";

    function saveLog(level: "info" | "error", message: string) {
      if (!message || !message.trim()) return;

      pendingWrites.push(
        createDeployLog({
          deployId,
          type,
          level,
          message: message.trim(),
        }).catch(console.error)
      );
    }

    const child = spawn(command, args, {
        cwd,
        shell: false,
    });

    child.stdout.on("data", (data) => {
      saveLog("info", data.toString());
    });

    child.stderr.on("data", (data) => {
      // Docker e Git muitas vezes escrevem progresso no stderr mesmo sem erro.
      const text = data.toString();
      saveLog("info", text);
      // Mantém só a cauda recente, o suficiente para diagnosticar a falha sem vazar output enorme.
      stderrTail = (stderrTail + text).slice(-500);
    });

    child.on("error", async (error) => {
      saveLog("error", error.message);
      await Promise.all(pendingWrites);
      reject(error);
    });

    child.on("close", async (code) => {
      await Promise.all(pendingWrites);

      if (code === 0) {
        resolve();
      } else {
        const detail = stderrTail.trim();
        reject(
          new Error(
            `${command} finalizou com código ${code}${detail ? `: ${detail}` : ""}`
          )
        );
      }
    });
  });
}