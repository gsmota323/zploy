import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis';

// Criamos uma fila chamada "DeployQueue" e passamos a conexão do Redis
export const deployQueue = new Queue('DeployQueue', {
  connection: redisConnection,
});

// Função auxiliar para injetar tarefas na fila
export async function addDeployJob(
  appId: string,
  repositoryUrl: string,
  deployId: string,
  dockerfile?: string,
  branch?: string,
) {
  const job = await deployQueue.add('build-image', {
    appId,
    repositoryUrl,
    deployId,
    dockerfile,
    branch,
  });
  
  console.log(`Job adicionado à fila: ${job.id} (App: ${appId}, Deploy: ${deployId})`);
  return job;
}