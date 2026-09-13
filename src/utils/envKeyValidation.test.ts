import test from "node:test";
import assert from "node:assert/strict";
import { isValidEnvVarKey, ENV_VAR_KEY_MAX_LENGTH } from "./envKeyValidation";

test("aceita nomes normais de variável de ambiente", () => {
  assert.equal(isValidEnvVarKey("NODE_ENV"), true);
  assert.equal(isValidEnvVarKey("DATABASE_URL"), true);
  assert.equal(isValidEnvVarKey("API_KEY"), true);
  assert.equal(isValidEnvVarKey("PORT"), true);
  assert.equal(isValidEnvVarKey("MY_VAR_123"), true);
  assert.equal(isValidEnvVarKey("_PRIVATE_VAR"), true);
});

test("rejeita caractere inválido para nomes de variável de ambiente", () => {
  assert.equal(isValidEnvVarKey("MY-VAR"), false);
  assert.equal(isValidEnvVarKey("MY VAR"), false);
  assert.equal(isValidEnvVarKey("MY.VAR"), false);
  assert.equal(isValidEnvVarKey("MY=VAR"), false);
  assert.equal(isValidEnvVarKey("1STARTS_WITH_NUMBER"), false);
});

test("rejeita chave contendo newline ou caracteres de controle", () => {
  assert.equal(isValidEnvVarKey("VALID\nINJECTED_KEY: evil"), false);
  assert.equal(isValidEnvVarKey("VALID\r\nKEY"), false);
  assert.equal(isValidEnvVarKey("VALID\tKEY"), false);
});

test("rejeita chave vazia", () => {
  assert.equal(isValidEnvVarKey(""), false);
  assert.equal(isValidEnvVarKey(undefined), false);
  assert.equal(isValidEnvVarKey(null), false);
});

test("rejeita chave acima do limite de tamanho", () => {
  const tooLong = "A".repeat(ENV_VAR_KEY_MAX_LENGTH + 1);
  const atLimit = "A".repeat(ENV_VAR_KEY_MAX_LENGTH);

  assert.equal(isValidEnvVarKey(tooLong), false);
  assert.equal(isValidEnvVarKey(atLimit), true);
});
