const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

const killNode = args.includes('--kill-node');

function runStep(command, commandArgs, name, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
    ...options,
  });

  if (result.status !== 0) {
    console.error(`[${name}] falhou com código ${result.status}`);
    return false;
  }

  return true;
}

function main() {
  console.log('Encerrando Zploy...');

  runStep(
    'docker',
    ['compose', 'down'],
    'docker-down'
  );

  // Opcional: finalizar processos Node órfãos no Windows.
  // Mantido por flag para não matar o próprio `node scripts/stop.js`.
  if (killNode && process.platform === 'win32') {
    runStep(
      'taskkill',
      ['/F', '/IM', 'node.exe'],
      'kill-node'
    );
  }

  console.log('Zploy encerrado.');
}

main();