import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDeploymentName,
  buildKubernetesManifests,
  buildRecoveryDecision,
  resolveNamespace,
  summarizeKubernetesHealth,
} from "./kubernetes";

test("resolveNamespace usa o namespace configurado no ambiente", () => {
  process.env.KUBERNETES_NAMESPACE = "staging";
  assert.equal(resolveNamespace(), "staging");
});

test("buildDeploymentName gera um nome estável para o deployment", () => {
  assert.equal(buildDeploymentName("Meu App", "123456"), "meu-app-123456");
});

test("buildKubernetesManifests inclui o namespace no manifest", () => {
  const manifest = buildKubernetesManifests({
    appId: "123456",
    appName: "Meu App",
    imageName: "zploy-app:latest",
    containerPort: 5006,
    envVars: [{ key: "FOO", value: "bar" }],
    namespace: "demo",
  });

  assert.match(manifest, /namespace: demo/);
  assert.match(manifest, /name: meu-app-123456/);
});

test("buildKubernetesManifests inclui autoscaling por CPU", () => {
  const manifest = buildKubernetesManifests({
    appId: "123456",
    appName: "Meu App",
    imageName: "zploy-app:latest",
    containerPort: 5006,
    envVars: [{ key: "FOO", value: "bar" }],
    namespace: "demo",
    minReplicas: 2,
    maxReplicas: 6,
    targetCPUUtilizationPercentage: 70,
  });

  assert.match(manifest, /kind: HorizontalPodAutoscaler/);
  assert.match(manifest, /minReplicas: 2/);
  assert.match(manifest, /maxReplicas: 6/);
  assert.match(manifest, /averageUtilization: 70/);
  assert.match(manifest, /cpu: "100m"/);
});

test("summarizeKubernetesHealth marca o deployment como saudável quando todos os pods estão prontos", () => {
  const summary = summarizeKubernetesHealth({
    ready: true,
    status: "Running",
    replicas: 2,
    availableReplicas: 2,
    unavailableReplicas: 0,
  });

  assert.equal(summary.healthy, true);
  assert.match(summary.message, /saudável|prontos/i);
});

test("buildRecoveryDecision recomenda rollback quando o deployment está em estado insalubre", () => {
  const decision = buildRecoveryDecision({
    healthy: false,
    ready: false,
    status: "CrashLoopBackOff",
    replicas: 2,
    availableReplicas: 0,
    unavailableReplicas: 2,
  });

  assert.equal(decision.shouldRollback, true);
  assert.match(decision.message, /rollback|recovery|revert/i);
});
