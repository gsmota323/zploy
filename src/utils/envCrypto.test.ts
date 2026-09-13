import test from "node:test";
import assert from "node:assert/strict";
import {
  encryptEnvValue,
  decryptEnvValue,
  resetEnvEncryptionKeyCacheForTests,
} from "./envCrypto";

const VALID_KEY_A = Buffer.alloc(32, 1).toString("base64");
const VALID_KEY_B = Buffer.alloc(32, 2).toString("base64");

function withEncryptionKey<T>(key: string | undefined, fn: () => T): T {
  const previous = process.env.ENV_ENCRYPTION_KEY;

  if (key === undefined) {
    delete process.env.ENV_ENCRYPTION_KEY;
  } else {
    process.env.ENV_ENCRYPTION_KEY = key;
  }

  resetEnvEncryptionKeyCacheForTests();

  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.ENV_ENCRYPTION_KEY;
    } else {
      process.env.ENV_ENCRYPTION_KEY = previous;
    }
    resetEnvEncryptionKeyCacheForTests();
  }
}

test("encryptEnvValue -> decryptEnvValue retorna o valor original", () => {
  withEncryptionKey(VALID_KEY_A, () => {
    const encrypted = encryptEnvValue("super-secret-value");
    assert.equal(decryptEnvValue(encrypted), "super-secret-value");
  });
});

test("mesmo valor gera ciphertexts diferentes a cada chamada (IV aleatório)", () => {
  withEncryptionKey(VALID_KEY_A, () => {
    const first = encryptEnvValue("mesma-senha");
    const second = encryptEnvValue("mesma-senha");
    assert.notEqual(first, second);
  });
});

test("alterar o ciphertext/tag faz a descriptografia falhar", () => {
  withEncryptionKey(VALID_KEY_A, () => {
    const encrypted = encryptEnvValue("valor-protegido");
    const [prefix, iv, tag, ciphertext] = encrypted.split(":");
    const tamperedCiphertext = Buffer.from(ciphertext, "base64");
    tamperedCiphertext[0] ^= 0xff;
    const tampered = [prefix, iv, tag, tamperedCiphertext.toString("base64")].join(":");

    assert.throws(() => decryptEnvValue(tampered));
  });
});

test("chave ausente é rejeitada (sem fallback para plaintext)", () => {
  withEncryptionKey(undefined, () => {
    assert.throws(() => encryptEnvValue("qualquer-valor"), /ENV_ENCRYPTION_KEY não configurada/);
  });
});

test("chave com tamanho inválido é rejeitada (não é truncada nem preenchida)", () => {
  const shortKey = Buffer.alloc(8, 1).toString("base64");
  withEncryptionKey(shortKey, () => {
    assert.throws(() => encryptEnvValue("qualquer-valor"), /esperado uma chave base64 de 32 bytes/);
  });
});

test("descriptografar com a chave errada falha", () => {
  const encrypted = withEncryptionKey(VALID_KEY_A, () => encryptEnvValue("valor-x"));

  withEncryptionKey(VALID_KEY_B, () => {
    assert.throws(() => decryptEnvValue(encrypted));
  });
});
