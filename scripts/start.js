const { spawn, spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

function run(command, args, name) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`\n[${name}] encerrado com código ${code}`);
      process.exit(code || 1);
    }
  });

  return child;
}

function runStep(command, args, name) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`[${name}] falhou com código ${result.status}`);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('Iniciando serviços de suporte do Zploy...');
  run('docker', ['compose', 'up', '-d', 'postgres', 'redis'], 'docker-compose');

  console.log('Aguardando os serviços ficarem prontos...');
  await wait(8000);

  console.log('Sincronizando banco de dados...');
  runStep('npx', ['prisma', 'migrate', 'deploy'], 'prisma-migrate-deploy');

  console.log('Garantindo dados iniciais...');
  runStep('npx', ['prisma', 'db', 'seed'], 'prisma-seed');

  console.log('Iniciando Zploy...');
  console.log('API + Worker');

  const api = run('npm', ['run', 'dev'], 'api');
  const worker = run('npm', ['run', 'worker'], 'worker');

  function shutdown() {
    api.kill('SIGTERM');
    worker.kill('SIGTERM');
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Falha ao iniciar o Zploy:', error);
  process.exit(1);
});
