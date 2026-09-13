import fs from "fs";
import os from "os";
import path from "path";

// Heartbeat em arquivo: evita transformar o worker num segundo servidor HTTP só para healthcheck.
export type WorkerHealthStatus = "starting" | "ok" | "error";

export interface WorkerHeartbeat {
  status: WorkerHealthStatus;
  updatedAt: string;
  redisStatus?: string;
  message?: string;
}

export const WORKER_HEALTH_FILE =
  process.env.WORKER_HEALTH_FILE || path.join(os.tmpdir(), "zploy-worker-health.json");

export const WORKER_HEALTH_INTERVAL_MS = Number(process.env.WORKER_HEALTH_INTERVAL_MS || 15_000);

// Tolerância generosa (3x o intervalo) para não marcar unhealthy por uma escrita atrasada isolada.
export const WORKER_HEALTH_MAX_AGE_MS = Number(
  process.env.WORKER_HEALTH_MAX_AGE_MS || WORKER_HEALTH_INTERVAL_MS * 3
);

// Nunca deve derrubar o worker: qualquer falha ao gravar o heartbeat é apenas logada.
export function writeWorkerHeartbeat(
  state: { status: WorkerHealthStatus; redisStatus?: string; message?: string },
  filePath: string = WORKER_HEALTH_FILE
): void {
  const heartbeat: WorkerHeartbeat = {
    status: state.status,
    updatedAt: new Date().toISOString(),
    redisStatus: state.redisStatus,
    message: state.message,
  };

  try {
    fs.writeFileSync(filePath, JSON.stringify(heartbeat));
  } catch (error) {
    console.warn(`[WorkerHealth] Falha ao gravar heartbeat em ${filePath}:`, error);
  }
}

export function readWorkerHeartbeatFile(filePath: string = WORKER_HEALTH_FILE): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export interface WorkerHealthCheckResult {
  healthy: boolean;
  reason?: string;
  heartbeat?: WorkerHeartbeat;
}

// Lógica pura (sem I/O) reutilizada tanto pelo CLI de healthcheck quanto pelos testes.
export function evaluateWorkerHeartbeat(
  raw: string | null,
  now: number = Date.now(),
  maxAgeMs: number = WORKER_HEALTH_MAX_AGE_MS
): WorkerHealthCheckResult {
  if (!raw) {
    return { healthy: false, reason: "Arquivo de heartbeat não encontrado." };
  }

  let heartbeat: WorkerHeartbeat;
  try {
    heartbeat = JSON.parse(raw);
  } catch {
    return { healthy: false, reason: "Heartbeat com formato inválido." };
  }

  if (heartbeat.status === "error") {
    return { healthy: false, reason: heartbeat.message || "Worker reportou erro.", heartbeat };
  }

  const updatedAt = Date.parse(heartbeat.updatedAt);
  if (!Number.isFinite(updatedAt)) {
    return { healthy: false, reason: "Heartbeat sem timestamp válido.", heartbeat };
  }

  const age = now - updatedAt;
  if (age > maxAgeMs) {
    return { healthy: false, reason: `Heartbeat desatualizado (${age}ms).`, heartbeat };
  }

  return { healthy: true, heartbeat };
}
