import { randomUUID } from "crypto";
import { redisConnection } from "../config/redis";

// Libera o lock somente se o valor atual ainda pertencer ao token do chamador (compare-and-delete atômico).
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

// Renova o TTL somente se o valor atual ainda pertencer ao token do chamador (compare-and-expire atômico).
const RENEW_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

export const DEPLOY_LOCK_TTL_MS = Number(process.env.DEPLOY_LOCK_TTL_MS || 5 * 60 * 1000);
export const DEPLOY_LOCK_RENEW_INTERVAL_MS = Number(
  process.env.DEPLOY_LOCK_RENEW_INTERVAL_MS || 60 * 1000
);
export const DEPLOY_LOCK_RETRY_DELAY_MS = Number(process.env.DEPLOY_LOCK_RETRY_DELAY_MS || 5000);

export interface DeployLockClient {
  set(
    key: string,
    value: string,
    ttlFlag: "PX",
    ttlMs: number,
    nxFlag: "NX"
  ): Promise<string | null>;
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

export function deployLockKey(appId: string) {
  return `deploy-lock:${appId}`;
}

export function createLockToken() {
  return randomUUID();
}

export function createDeployLockManager(client: DeployLockClient = redisConnection) {
  return {
    /** Aquisição atômica: SET deploy-lock:<appId> <token> NX PX <ttlMs> */
    async acquire(appId: string, token: string, ttlMs: number): Promise<boolean> {
      const result = await client.set(deployLockKey(appId), token, "PX", ttlMs, "NX");
      return result === "OK";
    },

    /** Renova o TTL apenas se o token ainda for o dono atual do lock. */
    async renew(appId: string, token: string, ttlMs: number): Promise<boolean> {
      const result = await client.eval(RENEW_SCRIPT, 1, deployLockKey(appId), token, ttlMs);
      return result === 1;
    },

    /** Remove o lock apenas se o token ainda for o dono atual (nunca um DEL incondicional). */
    async release(appId: string, token: string): Promise<boolean> {
      const result = await client.eval(RELEASE_SCRIPT, 1, deployLockKey(appId), token);
      return result === 1;
    },
  };
}

export type DeployLockManager = ReturnType<typeof createDeployLockManager>;

export const deployLockManager = createDeployLockManager();
