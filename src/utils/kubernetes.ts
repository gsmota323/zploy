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

function resolveIngressDomain() {
  const configuredDomain = process.env.KUBERNETES_INGRESS_DOMAIN?.trim();
  return configuredDomain || "localtest.me";
}

function buildIngressHost(appName: string, appId: string) {
  const uniqueSuffix = appId.slice(0, 6).toLowerCase();
  return `${slugify(appName)}-${uniqueSuffix}.${resolveIngressDomain()}`;
}

export function resolveNamespace() {
  return process.env.KUBERNETES_NAMESPACE || "default";
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
    minReplicas ?? process.env.KUBERNETES_MIN_REPLICAS ?? 1
  );

  const resolvedMaxReplicas = Number(
    maxReplicas ?? process.env.KUBERNETES_MAX_REPLICAS ?? 3
  );

  const resolvedTargetCPU = Number(
    targetCPUUtilizationPercentage ??
      process.env.KUBERNETES_CPU_TARGET ??
      70
  );

  if (!Number.isInteger(resolvedMinReplicas) || resolvedMinReplicas < 1) {
    throw new Error("minReplicas deve ser um inteiro maior ou igual a 1.");
  }

  if (!Number.isInteger(resolvedMaxReplicas) || resolvedMaxReplicas < 1) {
    throw new Error("maxReplicas deve ser um inteiro maior ou igual a 1.");
  }

  if (resolvedMaxReplicas < resolvedMinReplicas) {
    throw new Error(
      "maxReplicas deve ser maior ou igual a minReplicas."
    );
  }

  if (
    !Number.isInteger(resolvedTargetCPU) ||
    resolvedTargetCPU < 1 ||
    resolvedTargetCPU > 100
  ) {
    throw new Error(
      "targetCPUUtilizationPercentage deve estar entre 1 e 100."
    );
  }

  return {
    minReplicas: resolvedMinReplicas,
    maxReplicas: resolvedMaxReplicas,
    targetCPUUtilizationPercentage: resolvedTargetCPU,
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
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${deploymentName}
  namespace: ${namespace}
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
    - host: ${buildIngressHost(appName, appId)}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${deploymentName}
                port:
                  number: 80
`;
}

export async function deployToKubernetes({
  appId,
  appName,
  imageName,
  containerPort,
  envVars,
  deployId,
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
  minReplicas?: number;
  maxReplicas?: number;
  targetCPUUtilizationPercentage?: number;
}): Promise<KubernetesDeploymentResult> {
  if (
    !Number.isInteger(containerPort) ||
    containerPort < 1 ||
    containerPort > 65535
  ) {
    throw new Error(
      "containerPort deve estar entre 1 e 65535."
    );
  }

  const deploymentName = buildDeploymentName(appName, appId);
  const resolvedNamespace = resolveNamespace();
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

    try {
      await createDeployLog({
        deployId,
        type: "runtime",
        level: "info",
        message: `Carregando imagem ${imageName} no Minikube...`,
      });

      await execFileAsync("minikube", ["image", "load", imageName], {
        env: process.env,
      });

      await createDeployLog({
        deployId,
        type: "runtime",
        level: "info",
        message: `Imagem ${imageName} carregada no Minikube com sucesso.`,
      });
    } catch {
      await createDeployLog({
        deployId,
        type: "runtime",
        level: "info",
        message:
          "Não foi possível carregar imagem via minikube image load. Prosseguindo com kubectl apply.",
      });
    }

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

    // Continuamos pegando o NodePort apenas para histórico/debug se necessário,
    // mas a URL oficial da aplicação agora é gerenciada pelo Ingress!
    const nodePortOutput = await execFileAsync(
      "kubectl",
      ["get", "service", deploymentName, "-n", resolvedNamespace, "-o", "jsonpath={.spec.ports[0].nodePort}"],
      {
        env: process.env,
      }
    );

    const url = `http://${buildIngressHost(appName, appId)}`;

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

export async function rollbackKubernetesDeployment(deploymentName: string, namespace: string): Promise<string> {
  const resolvedNamespace = resolveNamespace();
  
  try {
    const result = await execFileAsync("kubectl", ["rollout", "undo", `deployment/${deploymentName}`, "-n", resolvedNamespace], {
      env: process.env,
    });
    return result.stdout.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha ao realizar rollback no Kubernetes: ${message}`);
  }
}
