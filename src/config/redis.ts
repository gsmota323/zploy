import Redis from 'ioredis';

// Cria a conexão com o Redis rodando no Docker na porta padrão
export const redisConnection = new Redis({
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null, 
});

redisConnection.on('connect', () => {
  console.log('Conectado ao Redis com sucesso!');
});

redisConnection.on('error', (err) => {
  console.error('Erro na conexão com o Redis:', err);
});