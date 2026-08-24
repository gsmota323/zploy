
export interface DeploymentResult {
  url: string;
  runtime: string;
  porta?: number;
  namespace?: string;
}

export interface DeploymentConfig {
  appId: string;
  appName: string;
  imageName: string;
  containerPort: number;
  deployId: string;
  envVars: { key: string; value: string }[];
  minReplicas?: number;
  maxReplicas?: number;
  targetCPUUtilizationPercentage?: number;
}

export interface DeploymentProvider {
  deploy(config: DeploymentConfig): Promise<DeploymentResult>;
  stop(appId: string): Promise<void>;
  remove(appId: string): Promise<void>;
}