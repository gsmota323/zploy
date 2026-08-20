const { spawn, spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

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

function runOptionalStep(command, args, name) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  if (result.status !== 0) {
    console.warn(`\n[${name}] falhou com código ${result.status}. Continuando em modo degradado.`);
    return false;
  }

  return true;
}

function run(command, args, name, env = process.env) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env,
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`\n[${name}] encerrado com código ${code}`);
      process.exit(code || 1);
    }
  });

  return child;
}

async function main() {
  console.log('Iniciando modo Kubernetes completo...');
  console.log('Subindo Minikube e habilitando addons necessários...');

  runStep('minikube', ['start'], 'minikube-start');
  runStep('minikube', ['addons', 'enable', 'ingress'], 'minikube-ingress');
  runOptionalStep('minikube', ['addons', 'enable', 'metrics-server'], 'minikube-metrics');

  console.log('Iniciando API + Worker com Kubernetes obrigatório (sem fallback)...');

  const app = run('npm', ['run', 'start'], 'start', {
    ...process.env,
    REQUIRE_KUBERNETES: 'true',
  });

  function shutdown() {
    app.kill('SIGTERM');
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Falha ao iniciar o modo Kubernetes:', error.message || error);
  process.exit(1);
});
