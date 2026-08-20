const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const root = path.resolve(__dirname, '..');
const preferredPort = Number(process.env.K8S_EXPOSE_PORT || 8080);
const portScanLimit = Number(process.env.K8S_EXPOSE_PORT_SCAN || 10);
const namespace = process.env.K8S_INGRESS_NAMESPACE || 'ingress-nginx';
const serviceName = process.env.K8S_INGRESS_SERVICE || 'ingress-nginx-controller';
const retryDelayMs = Number(process.env.K8S_EXPOSE_RETRY_MS || 2000);

let child = null;
let shuttingDown = false;
let activeLocalPort = preferredPort;

function log(message) {
  console.log(`[k8s:expose] ${message}`);
}

function canListenOnPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, '127.0.0.1');
  });
}

async function resolveLocalPort() {
  for (let offset = 0; offset <= portScanLimit; offset += 1) {
    const candidate = preferredPort + offset;
    // Escolhe a primeira porta livre para evitar falhas por conflito local.
    if (await canListenOnPort(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Nenhuma porta livre encontrada entre ${preferredPort} e ${preferredPort + portScanLimit}.`
  );
}

function startPortForward() {
  log(
    `Iniciando port-forward ${activeLocalPort}:80 para service/${serviceName} no namespace ${namespace}...`
  );

  child = spawn(
    'kubectl',
    ['port-forward', '-n', namespace, `service/${serviceName}`, `${activeLocalPort}:80`],
    {
      cwd: root,
      stdio: 'inherit',
      shell: false,
      env: process.env,
    }
  );

  child.on('exit', (code) => {
    if (shuttingDown) {
      return;
    }

    log(`Conexao encerrada (codigo ${code ?? 'desconhecido'}). Tentando reconectar em ${retryDelayMs}ms...`);

    setTimeout(() => {
      if (!shuttingDown) {
        startPortForward();
      }
    }, retryDelayMs);
  });
}

function shutdown() {
  shuttingDown = true;
  log('Encerrando exposicao do ingress...');

  if (child && !child.killed) {
    child.kill('SIGTERM');
  }

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

resolveLocalPort()
  .then((port) => {
    activeLocalPort = port;

    if (activeLocalPort !== preferredPort) {
      log(
        `Porta ${preferredPort} ocupada. Usando ${activeLocalPort}. Acesse: http://<app>.localtest.me:${activeLocalPort}`
      );
    } else {
      log(`Acesse: http://<app>.localtest.me:${activeLocalPort}`);
    }

    startPortForward();
  })
  .catch((error) => {
    log(error.message || String(error));
    process.exit(1);
  });
