import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  evaluateWorkerHeartbeat,
  writeWorkerHeartbeat,
  readWorkerHeartbeatFile,
} from "./workerHealth";

test("evaluateWorkerHeartbeat considera saudável um heartbeat recente com status ok", () => {
  const raw = JSON.stringify({ status: "ok", updatedAt: new Date().toISOString() });
  const result = evaluateWorkerHeartbeat(raw);
  assert.equal(result.healthy, true);
});

test("evaluateWorkerHeartbeat falha quando o arquivo não existe (raw nulo)", () => {
  const result = evaluateWorkerHeartbeat(null);
  assert.equal(result.healthy, false);
  assert.match(result.reason || "", /não encontrado/);
});

test("evaluateWorkerHeartbeat falha com JSON inválido", () => {
  const result = evaluateWorkerHeartbeat("{ isso não é json");
  assert.equal(result.healthy, false);
  assert.match(result.reason || "", /formato inválido/);
});

test("evaluateWorkerHeartbeat falha quando o status é error", () => {
  const raw = JSON.stringify({
    status: "error",
    updatedAt: new Date().toISOString(),
    message: "Conexão Redis em estado \"close\".",
  });
  const result = evaluateWorkerHeartbeat(raw);
  assert.equal(result.healthy, false);
  assert.match(result.reason || "", /Redis/);
});

test("evaluateWorkerHeartbeat falha quando o heartbeat está desatualizado", () => {
  const staleTimestamp = new Date(Date.now() - 60_000).toISOString();
  const raw = JSON.stringify({ status: "ok", updatedAt: staleTimestamp });
  const result = evaluateWorkerHeartbeat(raw, Date.now(), 45_000);
  assert.equal(result.healthy, false);
  assert.match(result.reason || "", /desatualizado/);
});

test("writeWorkerHeartbeat + readWorkerHeartbeatFile fazem round-trip corretamente", () => {
  const tempFile = path.join(os.tmpdir(), `zploy-worker-health-test-${Date.now()}.json`);

  try {
    writeWorkerHeartbeat({ status: "ok", redisStatus: "ready" }, tempFile);
    const raw = readWorkerHeartbeatFile(tempFile);
    const result = evaluateWorkerHeartbeat(raw);

    assert.equal(result.healthy, true);
    assert.equal(result.heartbeat?.redisStatus, "ready");
  } finally {
    fs.rmSync(tempFile, { force: true });
  }
});
