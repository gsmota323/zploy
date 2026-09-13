// Escolha de porta host para o DockerProvider, resistente a colisões (porta já ocupada por outro container/processo).
export const DOCKER_HOST_PORT_MIN = 30000;
export const DOCKER_HOST_PORT_MAX = 40000; // exclusivo, mesma faixa já usada anteriormente
export const MAX_HOST_PORT_ATTEMPTS = 10;

// Mensagens típicas do Docker quando a porta host já está em uso por outro processo/container.
export function isDockerPortConflictError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already allocated|address already in use/i.test(message);
}

function defaultRandomPort(): number {
  return Math.floor(Math.random() * (DOCKER_HOST_PORT_MAX - DOCKER_HOST_PORT_MIN)) + DOCKER_HOST_PORT_MIN;
}

/**
 * Tenta publicar o container em uma porta host livre. `runContainer` deve rejeitar
 * com o erro real do Docker quando a porta escolhida já estiver ocupada.
 * Só tenta novamente quando a falha é especificamente de porta em uso; qualquer
 * outro erro é propagado imediatamente. Após `maxAttempts`, lança um erro claro.
 */
export async function selectAvailableHostPort(
  runContainer: (port: number) => Promise<void>,
  options: { randomPort?: () => number; maxAttempts?: number } = {}
): Promise<number> {
  const randomPort = options.randomPort ?? defaultRandomPort;
  const maxAttempts = options.maxAttempts ?? MAX_HOST_PORT_ATTEMPTS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidatePort = randomPort();

    try {
      await runContainer(candidatePort);
      return candidatePort;
    } catch (error) {
      if (!isDockerPortConflictError(error)) {
        throw error;
      }

      lastError = error;
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Não foi possível publicar o container em uma porta livre entre ${DOCKER_HOST_PORT_MIN} e ${DOCKER_HOST_PORT_MAX} após ${maxAttempts} tentativa(s). Última falha: ${reason}`
  );
}
