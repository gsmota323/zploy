import test from "node:test";
import assert from "node:assert/strict";
import { isValidGithubRepositoryUrl } from "./githubWebhook";

test("isValidGithubRepositoryUrl aceita um repositório GitHub https válido", () => {
  assert.equal(isValidGithubRepositoryUrl("https://github.com/owner/repo"), true);
  assert.equal(isValidGithubRepositoryUrl("https://github.com/owner/repo/"), true);
});

test("isValidGithubRepositoryUrl rejeita hosts diferentes de github.com", () => {
  assert.equal(isValidGithubRepositoryUrl("https://gitlab.com/owner/repo"), false);
  assert.equal(isValidGithubRepositoryUrl("https://evil.com/github.com/owner/repo"), false);
});

test("isValidGithubRepositoryUrl rejeita protocolos diferentes de https", () => {
  assert.equal(isValidGithubRepositoryUrl("http://github.com/owner/repo"), false);
  assert.equal(isValidGithubRepositoryUrl("git@github.com:owner/repo.git"), false);
});

test("isValidGithubRepositoryUrl rejeita valores que poderiam ser interpretados como flags do git", () => {
  assert.equal(isValidGithubRepositoryUrl("--upload-pack=touch /tmp/pwned"), false);
  assert.equal(isValidGithubRepositoryUrl("-oProxyCommand=touch /tmp/pwned"), false);
});

test("isValidGithubRepositoryUrl rejeita caminhos que não sejam owner/repo", () => {
  assert.equal(isValidGithubRepositoryUrl("https://github.com/owner"), false);
  assert.equal(isValidGithubRepositoryUrl("https://github.com/owner/repo/extra"), false);
});
