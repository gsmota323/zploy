// Validação de EnvVar.key: nomes de variável de ambiente convencionais (POSIX-like),
// suficiente para impedir caracteres de controle/quebras de linha inválidos.

export const ENV_VAR_KEY_MAX_LENGTH = 100;

const ENV_VAR_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidEnvVarKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    key.length > 0 &&
    key.length <= ENV_VAR_KEY_MAX_LENGTH &&
    ENV_VAR_KEY_PATTERN.test(key)
  );
}
