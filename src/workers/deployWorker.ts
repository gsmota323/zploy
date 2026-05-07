import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis';

// O Worker fica sempre à escuta da "DeployQueue"
const worker = new Worker(
  'DeployQueue',
  async (job: Job) => {
    console.log(`\nWORKER: A iniciar processamento do Job ${job.id}`);
    console.log(`Dados recebidos - App ID: ${job.data.appId}, Repo: ${job.data.repositoryUrl}`);

    // Aqui o Docker vai clonar o repositório e fazer o build.
    // simulando que o trabalho pesado demora 5 segundos:
    console.log('simular o clone do repositório e build do Docker...');
    
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Espera 5 segundos

    console.log(`WORKER: Deploy do App ${job.data.appId} concluído com sucesso!\n`);
    
    // dps: atualiza a base de dados para status: "running"
    return { status: 'sucesso', message: 'Build finalizado' };
  },
  {
    connection: redisConnection,
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} finalizado e removido da fila.`);
});

worker.on('failed', (job, err) => {
  console.error(`Erro no Job ${job?.id}:`, err.message);
});