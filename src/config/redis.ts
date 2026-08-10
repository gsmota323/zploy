import Redis from 'ioredis';

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = Number(process.env.REDIS_PORT || 6379);

// Cria a conexão com o Redis rodando no Docker na porta padrão
export const redisConnection = new Redis({
  host: redisHost,
  port: redisPort,
  maxRetriesPerRequest: null, 
});

redisConnection.on('connect', () => {
  console.log('Conectado ao Redis com sucesso!');
});

redisConnection.on('error', (err) => {
  console.error('Erro na conexão com o Redis:', err);
});