import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import simpleGit from 'simple-git';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const execAsync = promisify(exec);
const git = simpleGit();
const prisma = new PrismaClient();

export const worker = new Worker('DeployQueue', async (job: Job) => {
    // extração do payload recebido na mensagem do Redis  
    const { appId, repositoryUrl, deployId } = job.data;
    
    console.log(`\n[Worker] Iniciando job ${job.id} para o App: ${appId}`);
    console.log(`[Worker] Repositório alvo: ${repositoryUrl}`);

    const tempDeployDir = path.join(__dirname, '..', '..', 'temp-deploys', appId);

    try {
        // verificação de existência do diretório no caso de algo residual de um deploy anterior
        if (fs.existsSync(tempDeployDir)) {
            console.log(`[Worker] Removendo diretório residual do deploy anterior...`);
            fs.rmSync(tempDeployDir, { recursive: true, force: true });
        }

        // alocação do novo diretório de trabalho
        fs.mkdirSync(tempDeployDir, { recursive: true });

        // transferindo o repositório remoto para o disco local
        console.log(`[Worker] Executando git clone do repositório remoto...`);
        await git.clone(repositoryUrl, tempDeployDir);
        console.log(`[Worker] Repositório clonado com sucesso no caminho: ${tempDeployDir}`);

        // --- DA DETEÇÃO DE RUNTIME ---
        console.log(`[Worker] Executando inspeção de sistema de arquivos para inferência de Runtime...`);
        let runtime = '';

        const hasPackageJson = fs.existsSync(path.join(tempDeployDir, 'package.json'));
        const hasRequirementsTxt = fs.existsSync(path.join(tempDeployDir, 'requirements.txt'));

        if (hasPackageJson) {
            runtime = 'Node';
            console.log(`[Worker] Runtime detetado: Node.js (package.json localizado).`);
        } else if (hasRequirementsTxt) {
            runtime = 'Python';
            console.log(`[Worker] Runtime detetado: Python (requirements.txt localizado).`);
        } else {
            throw new Error('Runtime não suportado. Ausência de manifestos de dependência padrão (package.json ou requirements.txt).');
        }
        // --- FIM DA DETEÇÃO DE RUNTIME ---

        // --- GERAÇÃO DO DOCKERFILE ---
        console.log(`[Worker] Iniciando a geração dinâmica do Dockerfile para o runtime: ${runtime}`);
        
        const dockerfilePath = path.join(tempDeployDir, 'Dockerfile');
        let dockerfileContent = '';

        if (runtime === 'Node') {
            dockerfileContent = `
FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
            `.trim();
        } else if (runtime === 'Python') {
            dockerfileContent = `
FROM python:3.9-slim
WORKDIR /usr/src/app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
            `.trim();
        }

        fs.writeFileSync(dockerfilePath, dockerfileContent, { encoding: 'utf-8' });
        console.log(`[Worker] Dockerfile gerado com sucesso no caminho: ${dockerfilePath}`);
        // --- FIM DA GERAÇÃO DO DOCKERFILE ---

        // --- INÍCIO DO DOCKER BUILD ---
        const imageName = `zploy-app-${appId}`;
        console.log(`[Worker] Iniciando o Docker Build da imagem: ${imageName}...`);

        // promise para controlar os eventos do "spawn"
        await new Promise((resolve, reject) => {
            // spawn(comando, [lista, de, argumentos])
            const buildProcess = spawn('docker', ['build', '-t', imageName, tempDeployDir]);

            // captura os logs (Stream de Output)
            buildProcess.stdout.on('data', (data) => {
                console.log(`🐳 [Build] ${data.toString().trim()}`);
            });

            // captura os erros (Stream de Error)
            buildProcess.stderr.on('data', (data) => {
                console.log(`⚠️ [Build Log] ${data.toString().trim()}`);
            });

            // fechamento de processo
            buildProcess.on('close', (code) => {
                if (code === 0) {
                    console.log(`✅ [Worker] Imagem Docker criada com sucesso: ${imageName}`);
                    resolve(true); 
                } else {
                    reject(new Error(`O Docker Build falhou com o código de saída: ${code}`)); 
                }
            });
        });
        // --- FIM DO DOCKER BUILD ---



        // --- INÍCIO DO DOCKER RUN ---
        console.log(`[Worker] A preparar para iniciar o container...`);

        // 1. Buscar variáveis no Prisma
        const envVars = await prisma.envVar.findMany({ where: { appId } });
        const envArgs = envVars.map(ev => `-e "${ev.key}=${ev.value}"`).join(' ');

        // 2. Configurações de rede e nome
        const containerPort = runtime === 'Node' ? 5006 : 8000;
        const hostPort = Math.floor(Math.random() * (40000 - 30000) + 30000);
        const containerName = `container-${appId}`;

        // 3. Remove o container antigo se existir 
        try {
            await execAsync(`docker rm -f ${containerName}`);
            console.log(`[Worker] Container antigo ${containerName} removido.`);
        } catch (e) {
            
        }

        // 4. Executar o comando final com as variáveis
        console.log(`[Worker] A mapear a porta externa ${hostPort} para a porta interna ${containerPort}...`);

        const runCommand = `docker run -d ${envArgs} -p ${hostPort}:${containerPort} --name ${containerName} ${imageName}`;
        await execAsync(runCommand);

        console.log(`🚀 [Worker] Deploy concluído!`);
        console.log(`🌐 [Worker] App online em: http://localhost:${hostPort}`);
        // --- FIM DO DOCKER RUN ---

        // --- INÍCIO DA ATUALIZAÇÃO DO BANCO DE DADOS ---
        console.log(`[Worker] A guardar o link na base de dados (Prisma)...`);
        
        // 1. Atualiza a App com o link final e o estado 'running'
        await prisma.app.update({
            where: { id: appId },
            data: { 
                url: `http://localhost:${hostPort}`,
                status: 'running' 
            }
        });

        // 2. Atualiza o Histórico de Deploy para 'success' (se existir)
        if (deployId) {
            await prisma.deploy.update({
                where: { id: deployId },
                data: { status: 'success' }
            });
        }
        // --- FIM DA ATUALIZAÇÃO DO BANCO DE DADOS ---

        
        if (fs.existsSync(tempDeployDir)) {
            try {
                fs.rmSync(tempDeployDir, { recursive: true, force: true });
                console.log(`🧹 [Worker] Pasta temporária limpa.`);
            } catch (cleanupError) {
                console.warn(`⚠️ [Worker] Aviso: Não foi possível apagar a pasta temporária, mas o deploy foi um sucesso.`);
            }
        }

        // o retorno sinaliza ao BullMQ a transição de estado do Job para 'completed'
        return { status: 'sucesso', porta: hostPort, runtime };

    } catch (error) {
        // tratamento de exceção 
        console.error(`[Worker] Falha na operação de deploy.`);
        
        // --- BÓNUS: AVISAR O BANCO DE DADOS QUE FALHOU ---
        if (deployId) {
            try {
                await prisma.deploy.update({
                    where: { id: deployId },
                    data: { status: 'failed' }
                });
            } catch (dbError) {
                console.error(`[Worker] Não foi possível atualizar o status de falha no banco:`, dbError);
            }
        }
        
        // apagando o diretório parcialmente clonado em caso de falha
        if (fs.existsSync(tempDeployDir)) {
             fs.rmSync(tempDeployDir, { recursive: true, force: true });
        }
        
        // informa a exceção para que o Worker encerre a execução e o BullMQ transite o status do Job (failed)
        throw new Error(`Falha no processamento: ${(error as Error).message}`); 
    }
}, { connection: redisConnection });

// Listeners de eventos para monitorização do ciclo de vida do Worker
worker.on('completed', (job, returnvalue) => {
    console.log(`🟢 [BullMQ] Job ${job.id} 100% concluído! A App está a correr na porta ${returnvalue?.porta}.`);
});

worker.on('failed', (job, err) => {
    console.log(`🔴 [BullMQ] Job ${job?.id} falhou. Motivo da exceção: ${err.message}`);
});