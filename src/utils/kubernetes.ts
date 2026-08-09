import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { createDeployLog } from "../services/deployLogService";

const execFileAsync = promisify(execFile);

export type KubernetesEnvVar = {
  key: string;
  value: string;
};

export type KubernetesDeploymentResult = {
  url?: string;
  manifestPath: string;
  namespace: string;
  deploymentName: string;
};

export type KubernetesHealthSummary = {
  healthy: boolean;
  ready: boolean;
  status: string;
  replicas: number;
  availableReplicas: number;
  unavailableReplicas: number;
  message: string;
};

export type KubernetesRecoveryDecision = {
  shouldRollback: boolean;
  action: "keep" | "rollback";
  message: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function resolveNamespace(namespace?: string) {
  return namespace || process.env.KUBERNETES_NAMESPACE || "default";
}

export function resolveAutoscalingConfig({
  minReplicas,
  maxReplicas,
  targetCPUUtilizationPercentage,
}: {
  minReplicas?: number;
  maxReplicas?: number;
  targetCPUUtilizationPercentage?: number;
} = {}) {
  const resolvedMinReplicas = Number(
    minReplicas ?? Number(process.env.KUBERNETES_MIN_REPLICAS ?? 1)
  );
  const resolvedMaxReplicas = Number(
    maxReplicas ?? Number(process.env.KUBERNETES_MAX_REPLICAS ?? 3)
  );
  const resolvedTargetCPU = Number(
    targetCPUUtilizationPercentage ?? Number(process.env.KUBERNETES_CPU_TARGET ?? 70)
  );

  return {
    minReplicas: Number.isFinite(resolvedMinReplicas) ? resolvedMinReplicas : 1,
    maxReplicas: Number.isFinite(resolvedMaxReplicas) ? resolvedMaxReplicas : 3,
    targetCPUUtilizationPercentage: Number.isFinite(resolvedTargetCPU) ? resolvedTargetCPU : 70,
  };
}

export function buildDeploymentName(appName: string, appId: string) {
  return `${slugify(appName || "app")}-${appId.slice(0, 6)}`;
}

export function summarizeKubernetesHealth({
  ready,
  status,
  replicas,
  availableReplicas,
  unavailableReplicas,
}: {
  ready: boolean;
  status: string;
  replicas: number;
  availableReplicas: number;
  unavailableReplicas: number;
}): KubernetesHealthSummary {
  const healthy = ready && unavailableReplicas === 0 && replicas > 0;

  const message = healthy
    ? `Deployment saudável: ${availableReplicas} de ${replicas} réplicas prontas.`
    : `Deployment em problema: ${unavailableReplicas} réplicas indisponíveis em ${replicas}.`;

  return {
    healthy,
    ready,
    status,
    replicas,
    availableReplicas,
    unavailableReplicas,
    message,
  };
}

export function buildRecoveryDecision({
  healthy,
  ready,
  status,
  replicas,
  availableReplicas,
  unavailableReplicas,
}: {
  healthy: boolean;
  ready: boolean;
  status: string;
  replicas: number;
  availableReplicas: number;
  unavailableReplicas: number;
}): KubernetesRecoveryDecision {
  const shouldRollback =
    !healthy || !ready || unavailableReplicas > 0 || (replicas > 0 && availableReplicas === 0);

  if (shouldRollback) {
    return {
      shouldRollback: true,
      action: "rollback",
      message: `Rollback recomendado: deployment em estado ${status} com ${unavailableReplicas} réplicas indisponíveis.`,
    };
  }

  return {
    shouldRollback: false,
    action: "keep",
    message: "Deployment está estável; manutenção não é necessária.",
  };
}

export function buildKubernetesManifests({
  appId,
  appName,
  imageName,
  containerPort,
  envVars,
  namespace = "default",
  minReplicas,
  maxReplicas,
  targetCPUUtilizationPercentage,
}: {
  appId: string;
  appName: string;
  imageName: string;
  containerPort: number;
  envVars: KubernetesEnvVar[];
  namespace?: string;
  minReplicas?: number;
  maxReplicas?: number;
  targetCPUUtilizationPercentage?: number;
}) {
  const deploymentName = buildDeploymentName(appName, appId);
  const autoscaling = resolveAutoscalingConfig({
    minReplicas,
    maxReplicas,
    targetCPUUtilizationPercentage,
  });

  const envEntries = envVars
    .map((envVar) => `            - name: ${envVar.key}\n              value: ${JSON.stringify(envVar.value)}`)
    .join("\n");

  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${deploymentName}
  namespace: ${namespace}
spec:
  replicas: ${autoscaling.minReplicas}
  selector:
    matchLabels:
      app: ${deploymentName}
  template:
    metadata:
      labels:
        app: ${deploymentName}
    spec:
      containers:
        - name: ${deploymentName}
          image: ${imageName}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: ${containerPort}
          resources:
            requests:
              cpu: "100m"
            limits:
              cpu: "500m"
          env:
            - name: PORT
              value: "${containerPort}"
${envEntries ? `${envEntries}\n` : ""}---
apiVersion: v1
kind: Service
metadata:
  name: ${deploymentName}
  namespace: ${namespace}
spec:
  selector:
    app: ${deploymentName}
  ports:
    - port: 80
      targetPort: ${containerPort}
  type: NodePort
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${deploymentName}
  namespace: ${namespace}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${deploymentName}
  minReplicas: ${autoscaling.minReplicas}
  maxReplicas: ${autoscaling.maxReplicas}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: ${autoscaling.targetCPUUtilizationPercentage}
`;
}

export async function deployToKubernetes({
  appId,
  appName,
  imageName,
  containerPort,
  envVars,
  deployId,
  namespace,
  minReplicas,
  maxReplicas,
  targetCPUUtilizationPercentage,
}: {
  appId: string;
  appName: string;
  imageName: string;
  containerPort: number;
  envVars: KubernetesEnvVar[];
  deployId: string;
  namespace?: string;
  minReplicas?: number;
  maxReplicas?: number;
  targetCPUUtilizationPercentage?: number;
}): Promise<KubernetesDeploymentResult> {
  const deploymentName = buildDeploymentName(appName, appId);
  const resolvedNamespace = resolveNamespace(namespace);
  const manifestDir = path.join(process.cwd(), "kubernetes", "manifests", appId);

  fs.mkdirSync(manifestDir, { recursive: true });

  const manifestPath = path.join(manifestDir, `${deploymentName}.yaml`);
  const manifestContent = buildKubernetesManifests({
    appId,
    appName,
    imageName,
    containerPort,
    envVars,
    namespace: resolvedNamespace,
    minReplicas,
    maxReplicas,
    targetCPUUtilizationPercentage,
  });

  fs.writeFileSync(manifestPath, manifestContent, { encoding: "utf-8" });

  try {
    await createDeployLog({
      deployId,
      type: "runtime",
      level: "info",
      message: `Publicando o manifest do Kubernetes em ${manifestPath} no namespace ${resolvedNamespace}`,
    });

    await execFileAsync("kubectl", ["apply", "-f", manifestPath], {
      env: process.env,
    });

    await execFileAsync(
      "kubectl",
      ["rollout", "status", `deployment/${deploymentName}`, "-n", resolvedNamespace, "--timeout=180s"],
      {
        env: process.env,
      }
    );

    const nodePortOutput = await execFileAsync(
      "kubectl",
      ["get", "service", deploymentName, "-n", resolvedNamespace, "-o", "jsonpath={.spec.ports[0].nodePort}"],
      {
        env: process.env,
      }
    );

    const nodePort = Number(nodePortOutput.stdout.trim());
    const url = Number.isFinite(nodePort) ? `http://127.0.0.1:${nodePort}` : undefined;

    return {
      url,
      manifestPath,
      namespace: resolvedNamespace,
      deploymentName,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha ao publicar no Kubernetes: ${message}`);
  }
}
