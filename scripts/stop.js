const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

const stopK8s = args.includes('--k8s');
const stopDemo = args.includes('--demo');
const killNode = args.includes('--kill-node');

function runStep(command, commandArgs, name, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
    ...options,
  });

  return result.status === 0;
}

function main() {
  console.log('Encerrando Zploy...');

  if (stopDemo) {
    runStep(
      'docker',
      ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.demo.yml', 'down'],
      'docker-demo-down'
    );
  }

  runStep('docker', ['compose', 'down'], 'docker-down');

  if (stopK8s) {
    runStep('minikube', ['stop'], 'minikube-stop');
  }

  // Opcional: finalizar processos Node órfãos no Windows.
  // Mantido por flag para não matar o próprio `node scripts/stop.js`.
  if (killNode && process.platform === 'win32') {
    runStep('taskkill', ['/F', '/IM', 'node.exe'], 'kill-node');
  }

  console.log('Zploy encerrado.');
}

main();