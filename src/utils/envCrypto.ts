import crypto from "crypto";

// AES-256-GCM: criptografia autenticada (confidencialidade + integridade) para EnvVar.value em repouso.
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH_BYTES = 32; // AES-256
const IV_LENGTH_BYTES = 12; // recomendado pelo NIST para GCM
const FORMAT_PREFIX = "encv1";

let cachedKey: Buffer | null = null;

// Nunca logar a chave nem parte dela.
function resolveEncryptionKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }

  const raw = process.env.ENV_ENCRYPTION_KEY;

  if (!raw || !raw.trim()) {
    throw new Error(
      "ENV_ENCRYPTION_KEY não configurada. Defina uma chave base64 de 32 bytes (AES-256) para armazenar variáveis de ambiente de apps."
    );
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw.trim(), "base64");
  } catch {
    throw new Error("ENV_ENCRYPTION_KEY inválida: não é um valor base64 válido.");
  }

  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `ENV_ENCRYPTION_KEY inválida: esperado uma chave base64 de ${KEY_LENGTH_BYTES} bytes (AES-256), recebido ${key.length} bytes.`
    );
  }

  cachedKey = key;
  return cachedKey;
}

export function encryptEnvValue(plainText: string): string {
  const key = resolveEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [FORMAT_PREFIX, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptEnvValue(storedValue: string): string {
  const key = resolveEncryptionKey();
  const parts = storedValue.split(":");

  if (parts.length !== 4 || parts[0] !== FORMAT_PREFIX) {
    throw new Error(
      "Valor de EnvVar em formato inválido ou não criptografado; não é possível descriptografar."
    );
  }

  const [, ivPart, tagPart, ciphertextPart] = parts;
  const iv = Buffer.from(ivPart, "base64");
  const authTag = Buffer.from(tagPart, "base64");
  const ciphertext = Buffer.from(ciphertextPart, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const plainText = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plainText.toString("utf8");
}

// Exposto apenas para os testes resetarem o cache da chave entre casos.
export function resetEnvEncryptionKeyCacheForTests() {
  cachedKey = null;
}
