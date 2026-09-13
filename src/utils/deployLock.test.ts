import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createDeployLockManager, DeployLockClient } from "./deployLock";
import { redisConnection } from "../config/redis";

// Importar deployLock.ts também importa a conexão real do Redis (config/redis.ts é
// compartilhada com o resto da app). Como este teste não depende de Redis de verdade,
// encerramos a conexão ao final para o processo de teste não ficar pendurado tentando reconectar.
after(() => {
  redisConnection.disconnect();
});

// Cliente Redis falso em memória, implementando apenas o subconjunto usado pelo lock
// (SET NX PX e EVAL de scripts Lua de compare-and-delete/compare-and-expire).
function createFakeRedisClient(): DeployLockClient {
  const store = new Map<string, { value: string; expiresAt: number }>();

  function isExpired(key: string) {
    const entry = store.get(key);
    if (!entry) return true;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return true;
    }
    return false;
  }

  return {
    async set(key, value, _ttlFlag, ttlMs, _nxFlag) {
      if (!isExpired(key)) {
        return null;
      }
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return "OK";
    },
    async eval(script, _numKeys, ...args) {
      const [key, tokenArg, maybeTtl] = args as [string, string, number?];

      if (isExpired(key)) {
        return 0;
      }

      const entry = store.get(key)!;
      if (entry.value !== tokenArg) {
        return 0;
      }

      if (script.includes("pexpire")) {
        entry.expiresAt = Date.now() + Number(maybeTtl);
        return 1;
      }

      // script de release (compare-and-delete)
      store.delete(key);
      return 1;
    },
  };
}

test("acquire concede o lock quando ele está livre", async () => {
  const manager = createDeployLockManager(createFakeRedisClient());

  const acquired = await manager.acquire("app-1", "token-a", 5000);
  assert.equal(acquired, true);
});

test("acquire falha quando o lock já está preso por outro token", async () => {
  const manager = createDeployLockManager(createFakeRedisClient());

  assert.equal(await manager.acquire("app-1", "token-a", 5000), true);
  assert.equal(await manager.acquire("app-1", "token-b", 5000), false);
});

test("release só remove o lock se o token pertencer ao chamador", async () => {
  const manager = createDeployLockManager(createFakeRedisClient());

  await manager.acquire("app-1", "token-a", 5000);

  // Um token diferente (ex.: job antigo após expiração) não pode remover o lock atual.
  assert.equal(await manager.release("app-1", "token-b"), false);
  assert.equal(await manager.acquire("app-1", "token-c", 5000), false);

  // O dono correto consegue liberar, liberando o recurso para o próximo deploy.
  assert.equal(await manager.release("app-1", "token-a"), true);
  assert.equal(await manager.acquire("app-1", "token-c", 5000), true);
});

test("renew só estende o TTL se o token ainda pertencer ao chamador", async () => {
  const manager = createDeployLockManager(createFakeRedisClient());

  await manager.acquire("app-1", "token-a", 50);
  assert.equal(await manager.renew("app-1", "token-a", 5000), true);

  // token errado não deve conseguir renovar (nem afetar o lock do dono real)
  assert.equal(await manager.renew("app-1", "token-b", 5000), false);
});

test("locks de apps diferentes não interferem entre si", async () => {
  const manager = createDeployLockManager(createFakeRedisClient());

  assert.equal(await manager.acquire("app-1", "token-a", 5000), true);
  assert.equal(await manager.acquire("app-2", "token-b", 5000), true);
});

console.log("deployLock test suite carregada");
