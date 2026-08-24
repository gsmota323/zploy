import { execFile } from "child_process";
import { promisify } from "util";
import { DeploymentProvider, DeploymentConfig, DeploymentResult } from "./deploymentProvider";
import { deployToKubernetes, resolveNamespace } from "../../utils/kubernetes";
import { createDeployLog } from "../deployLogService";

const execFileAsync = promisify(execFile);

export class KubernetesProvider implements DeploymentProvider {
  
  async deploy(config: DeploymentConfig): Promise<DeploymentResult> {
    const k8sResult = await deployToKubernetes({
      appId: config.appId,
      appName: config.appName,
      imageName: config.imageName,
      containerPort: config.containerPort,
      envVars: config.envVars,
      deployId: config.deployId,
      minReplicas: config.minReplicas,
      maxReplicas: config.maxReplicas,
      targetCPUUtilizationPercentage: config.targetCPUUtilizationPercentage,
    });

    return {
      url: k8sResult.url || "http://127.0.0.1",
      runtime: "Kubernetes",
      namespace: k8sResult.namespace,
    };
  }

  async stop(appId: string): Promise<void> {
    const namespace = resolveNamespace();
    try {
      // Escala o Deployment para 0 réplicas (forma oficial de "parar" no K8s sem deletar)
      await execFileAsync("kubectl", [
        "scale",
        "deployment",
        `-l app=zploy-${appId}`, // Assumindo que seu label termine assim, ou ajuste conforme seu buildDeploymentName
        "--replicas=0",
        "-n",
        namespace
      ]);
    } catch (error) {
      console.warn(`[KubernetesProvider] Falha ao parar pods do app ${appId}`);
    }
  }

  async remove(appId: string): Promise<void> {
    const namespace = resolveNamespace();
    try {
      // Remove tudo atrelado a essa label: Deployment, Service, Ingress, HPA
      await execFileAsync("kubectl", [
        "delete",
        "all,ingress",
        `-l app=zploy-${appId}`, // Confirme se a label 'app' bate com o seu manifest
        "-n",
        namespace
      ]);
    } catch (error) {
      console.warn(`[KubernetesProvider] Falha ao remover recursos K8s do app ${appId}`);
    }
  }
}