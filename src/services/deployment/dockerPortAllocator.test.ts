import test from "node:test";
import assert from "node:assert/strict";
import {
  selectAvailableHostPort,
  isDockerPortConflictError,
} from "./dockerPortAllocator";

function portConflictError() {
  return new Error(
    "docker finalizou com código 125: Bind for 0.0.0.0:30001 failed: port is already allocated"
  );
}

test("isDockerPortConflictError reconhece as mensagens típicas do Docker", () => {
  assert.equal(isDockerPortConflictError(portConflictError()), true);
  assert.equal(
    isDockerPortConflictError(new Error("listen tcp 0.0.0.0:30001: bind: address already in use")),
    true
  );
  assert.equal(isDockerPortConflictError(new Error("imagem não encontrada")), false);
});

test("porta livre é selecionada de primeira", async () => {
  const attempts: number[] = [];

  const port = await selectAvailableHostPort(
    async (candidatePort) => {
      attempts.push(candidatePort);
    },
    { randomPort: () => 30500 }
  );

  assert.equal(port, 30500);
  assert.deepEqual(attempts, [30500]);
});

test("porta ocupada é ignorada e uma nova porta é tentada", async () => {
  const ports = [30001, 30002, 30003];
  let index = 0;
  const attempts: number[] = [];

  const port = await selectAvailableHostPort(
    async (candidatePort) => {
      attempts.push(candidatePort);
      if (candidatePort === 30001) {
        throw portConflictError();
      }
    },
    { randomPort: () => ports[index++] }
  );

  assert.equal(port, 30002);
  assert.deepEqual(attempts, [30001, 30002]);
});

test("limite de tentativas é respeitado e gera erro claro", async () => {
  let calls = 0;

  await assert.rejects(
    () =>
      selectAvailableHostPort(
        async () => {
          calls++;
          throw portConflictError();
        },
        { randomPort: () => 30999, maxAttempts: 3 }
      ),
    /Não foi possível publicar o container em uma porta livre.*após 3 tentativa/
  );

  assert.equal(calls, 3);
});

test("erro que não é de porta ocupada é propagado imediatamente, sem retry", async () => {
  let calls = 0;

  await assert.rejects(
    () =>
      selectAvailableHostPort(
        async () => {
          calls++;
          throw new Error("imagem não encontrada");
        },
        { randomPort: () => 30777, maxAttempts: 5 }
      ),
    /imagem não encontrada/
  );

  assert.equal(calls, 1);
});
