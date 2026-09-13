// Script mínimo para o HEALTHCHECK do Docker: sem servidor HTTP, só lê o heartbeat gravado pelo worker.
import { readWorkerHeartbeatFile, evaluateWorkerHeartbeat } from "./workerHealth";

const result = evaluateWorkerHeartbeat(readWorkerHeartbeatFile());

if (!result.healthy) {
  console.error(`[WorkerHealthCheck] unhealthy: ${result.reason}`);
  process.exit(1);
}

console.log("[WorkerHealthCheck] ok");
process.exit(0);
