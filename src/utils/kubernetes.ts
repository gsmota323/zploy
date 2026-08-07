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

export function buildDeploymentName(appName: string, appId: string) {
  return `${slugify(appName || "app")}-${appId.slice(0, 6)}`;
}

export function buildKubernetesManifests({
  appId,
  appName,
  imageName,
  containerPort,
  envVars,
  namespace = "default",
}: {
  appId: string;
  appName: string;
  imageName: string;
  containerPort: number;
  envVars: KubernetesEnvVar[];
  namespace?: string;
}) {
  const deploymentName = buildDeploymentName(appName, appId);

  const envEntries = envVars
    .map((envVar) => `            - name: ${envVar.key}\n              value: ${JSON.stringify(envVar.value)}`)
    .join("\n");

  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${deploymentName}
  namespace: ${namespace}
spec:
  replicas: 1
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
}: {
  appId: string;
  appName: string;
  imageName: string;
  containerPort: number;
  envVars: KubernetesEnvVar[];
  deployId: string;
  namespace?: string;
}): Promise<KubernetesDeploymentResult> {
  const deploymentName = buildDeploymentName(appName, appId);
  const resolvedNamespace = resolveNamespace(namespace);
  const manfiestDir = path.join(process.cwd(), "kubernetes", "manifests", appId);

  fs.mkdirSync(manfiestDir, { recursive: true });

  const manifestPath = path.join(manfiestDir, `${deploymentName}.yaml`);
  const manifestContent = buildKubernetesManifests({
    appId,
    appName,
    imageName,
    containerPort,
    envVars,
    namespace: resolvedNamespace,
  });

  fs.writeFileSync(manifestPath, manifestContent, { encoding: "utf-8" });

  try {
    await createDeployLog({
      deployId,
      type: "runtime",
      level: "info",
      message: `Publicando manifest Kubernetes em ${manifestPath} no namespace ${resolvedNamespace}`,
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
