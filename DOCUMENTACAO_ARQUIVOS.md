# Documentação dos arquivos do projeto Zploy

Este arquivo reúne uma explicação prática do papel de cada parte do repositório, com foco em ajudar na consulta rápida durante o desenvolvimento ou na apresentação do TCC.

## 1. Visão geral do projeto

O Zploy é um protótipo de plataforma de deploy inspirada em um PaaS. Ele permite:

- criar aplicativos
- autenticar usuários
- disparar deploys manualmente ou via webhook do GitHub
- construir imagens Docker
- publicar aplicações localmente com Docker ou no Kubernetes, quando disponível
- acompanhar logs e status de deploy

A arquitetura é dividida em:

- API Express para receber requisições
- Controllers para tratar as rotas
- Services para regra de negócio
- Prisma + PostgreSQL para persistência
- Redis + BullMQ para processamento assíncrono
- Worker para executar o deploy em background
- Painel web para interação simples

---

## 2. Arquivos raiz do repositório

### [package.json](package.json)
Define as dependências do projeto, os scripts de execução e as ferramentas utilizadas. Aqui ficam comandos como:

- npm run dev: inicia a API
- npm run worker: inicia o worker de deploy
- npm run prisma:migrate: executa as migrations do Prisma

### [docker-compose.yml](docker-compose.yml)
Configura os serviços locais necessários para o projeto funcionar:

- PostgreSQL: armazena os dados
- Redis: atua como broker da fila de deploys

### [prisma.config.ts](prisma.config.ts)
Configuração do Prisma para integração com o projeto.

### [tsconfig.json](tsconfig.json)
Configura o TypeScript do projeto, definindo opções de compilação e suporte a módulos.

### [README.md](README.md)
Documento principal do projeto, com instruções de instalação, uso e fluxo básico.

### [ROTEIRO.md](ROTEIRO.md)
Arquivo com um roteiro ou guia de execução/organização do projeto, útil para apresentação ou acompanhamento do desenvolvimento.

### [.env](.env)
Arquivo de variáveis de ambiente. Guarda segredos como:

- URL do banco
- segredo do JWT
- secret do webhook do GitHub

> Este arquivo normalmente não deve ser versionado publicamente.

---

## 3. Estrutura do banco de dados

### [prisma/schema.prisma](prisma/schema.prisma)
Define o modelo do banco de dados.

Modelos principais:

- User: representa os usuários
- App: representa cada aplicação cadastrada
- Deploy: guarda cada tentativa de deploy
- DeployLog: armazena logs relacionados ao deploy
- EnvVar: armazena variáveis de ambiente por app

Esse é um dos arquivos centrais do projeto, porque define quase toda a lógica de persistência.

### [prisma/seed.ts](prisma/seed.ts)
Popula o banco com dados iniciais. No projeto atual, ele cria um usuário padrão para testes.

### [prisma/migrations](prisma/migrations)
Contém as versões do schema do banco, usadas pelo Prisma para evoluir o banco de forma controlada.

---

## 4. Estrutura principal da aplicação

### [src/app.ts](src/app.ts)
É o ponto central da aplicação Express. Ele:

- monta as rotas da API
- habilita CORS e JSON
- registra as rotas de usuário, auth, apps, deploys e Kubernetes
- implementa o endpoint de webhook do GitHub

Esse arquivo é o “coração” da aplicação web.

### [src/server.ts](src/server.ts)
Inicia o servidor HTTP e escuta na porta 3000.

---

## 5. Rotas

### [src/routes/authRoutes.ts](src/routes/authRoutes.ts)
Define as rotas de autenticação:

- cadastro
- login

### [src/routes/userRoutes.ts](src/routes/userRoutes.ts)
Define a rota para listar usuários, protegida por autenticação JWT.

### [src/routes/appRoutes.ts](src/routes/appRoutes.ts)
Agrupa as rotas relacionadas a apps:

- criar app
- listar apps
- remover app
- disparar deploy
- reexecutar deploy
- gerenciar variáveis de ambiente
- parar app

### [src/routes/deployRoutes.ts](src/routes/deployRoutes.ts)
Expõe rota para buscar logs de deploy.

### [src/routes/kubernetesRoutes.ts](src/routes/kubernetesRoutes.ts)
Define rotas para consultar status de pods, logs e rollback em ambientes Kubernetes.

---

## 6. Controllers

### [src/controllers/authController.ts](src/controllers/authController.ts)
Recebe requisições de login e cadastro e repassa para o service correspondente.

### [src/controllers/userController.ts](src/controllers/userController.ts)
Controla a listagem de usuários.

### [src/controllers/appController.ts](src/controllers/appController.ts)
Responsável pelo fluxo de aplicativos. Aqui são tratadas operações como:

- criar app
- listar apps do usuário
- apagar app
- disparar deploy manualmente
- reexecutar o último deploy

### [src/controllers/deployController.ts](src/controllers/deployController.ts)
Controla a criação de deploys, registro de logs e parada de aplicativos.

### [src/controllers/envController.ts](src/controllers/envController.ts)
Gerencia variáveis de ambiente de um app, com validação de ownership do usuário.

### [src/controllers/kubernetesController.ts](src/controllers/kubernetesController.ts)
Controla integrações com o Kubernetes, incluindo:

- buscar status do pod
- buscar logs
- disparar rollback

---

## 7. Services

### [src/services/authService.ts](src/services/authService.ts)
Contém a lógica de autenticação:

- verifica o usuário pelo email
- compara senha com bcrypt
- gera um token JWT

### [src/services/userService.ts](src/services/userService.ts)
Responsável por criar usuários e salvar a senha de forma segura com hash.

### [src/services/appService.ts](src/services/appService.ts)
Encapsula a regra de negócio para criar, buscar e excluir apps.

### [src/services/envService.ts](src/services/envService.ts)
Responsável por salvar, listar e deletar variáveis de ambiente de um app.

### [src/services/deployLogService.ts](src/services/deployLogService.ts)
Centraliza a criação e leitura dos logs de deploy no banco.

---

## 8. Middlewares

### [src/middlewares/authMiddleware.ts](src/middlewares/authMiddleware.ts)
Middleware de autenticação.

Ele lê o token JWT do header Authorization e, se válido, anexa o userId à requisição. Isso protege rotas que precisam de usuário autenticado.

---

## 9. Configuração e conexões externas

### [src/config/prisma.ts](src/config/prisma.ts)
Instancia o Prisma Client para ser reutilizado pelo projeto.

### [src/config/redis.ts](src/config/redis.ts)
Cria a conexão com o Redis, usado como fila para processar deploys em background.

---

## 10. Fila e worker de deploy

### [src/queues/deployQueue.ts](src/queues/deployQueue.ts)
Cria a fila BullMQ chamada DeployQueue e adiciona jobs de deploy nela.

Esse arquivo é o ponto de entrada para colocar um deploy em processamento assíncrono.

### [src/workers/deployWorker.ts](src/workers/deployWorker.ts)
É o coração do fluxo de deploy. Ele executa o processo de:

1. receber o job da fila
2. clonar o repositório
3. detectar se é Node.js ou Python
4. gerar um Dockerfile
5. construir a imagem Docker
6. publicar a aplicação
7. atualizar o status no banco
8. registrar logs

Esse arquivo é provavelmente o mais importante do fluxo operacional.

---

## 11. Utilitários

### [src/utils/githubWebhook.ts](src/utils/githubWebhook.ts)
Centraliza a lógica de webhook do GitHub.

Funções principais:

- identificar se o evento é relevante
- normalizar URLs de repositório
- validar assinatura do webhook
- comparar se um repositório recebido corresponde ao app cadastrado

### [src/utils/dockerfile.ts](src/utils/dockerfile.ts)
Responsável por:

- inferir a porta do container
- gerar um Dockerfile padrão para Node.js ou Python
- aceitar um Dockerfile customizado se for fornecido

### [src/utils/runCommandWithLogs.ts](src/utils/runCommandWithLogs.ts)
Executa comandos do terminal e salva a saída em logs de deploy.

### [src/utils/kubernetes.ts](src/utils/kubernetes.ts)
Responsável pela integração com Kubernetes.

Ele gera manifests YAML, aplica no cluster, faz rollback e ajuda na análise de saúde do deployment.

---

## 12. Interface web

### [frontend/index.html](frontend/index.html)
Landing page da plataforma. Apresenta o produto e direciona para login/cadastro ou dashboard.

### [frontend/login.html](frontend/login.html)
Tela de autenticação da plataforma. Permite:

- fazer login
- criar conta
- validar usuário/senha

### [frontend/dashboard.html](frontend/dashboard.html)
Painel principal de apps. Permite:

- listar apps
- criar app
- navegar para detalhe da aplicação

### [frontend/app.html](frontend/app.html)
Detalhe do app. Permite:

- disparar deploy
- consultar logs
- consultar status do Kubernetes
- configurar variáveis de ambiente
- remover app

---

## 13. Pasta temporária de deploy

### [temp-deploys](temp-deploys)
Pasta usada para armazenar os arquivos de um deploy temporário. Quando o worker faz o clone e monta a imagem, ele costuma trabalhar dentro dessa pasta.

Dentro dela há um exemplo de app com arquivos como:

- package.json
- Dockerfile
- views e public
- README

Essa pasta serve como material de exemplo ou ambiente de teste local.

---

## 14. Pasta Kubernetes

### [kubernetes](kubernetes)
Pasta destinada aos manifests YAML usados na publicação no Kubernetes.

Ela é importante para o fluxo mais avançado do projeto, quando o deploy é feito no cluster.

---

## 15. Fluxo de execução típico

Um deploy completo normalmente segue este caminho:

1. O usuário faz login no painel ou na API.
2. O app é criado no banco.
3. O deploy é disparado manualmente ou via webhook.
4. O controller cria um registro de deploy.
5. A fila BullMQ recebe o job.
6. O worker baixa o código, monta a imagem Docker e publica a aplicação.
7. O status e os logs são atualizados no banco.
8. O painel mostra o resultado para o usuário.

---

## 16. Onde olhar primeiro

Se você quiser entender o projeto rapidamente, comece por esta ordem:

1. [src/app.ts](src/app.ts)
2. [src/workers/deployWorker.ts](src/workers/deployWorker.ts)
3. [src/controllers/appController.ts](src/controllers/appController.ts)
4. [src/queues/deployQueue.ts](src/queues/deployQueue.ts)
5. [prisma/schema.prisma](prisma/schema.prisma)
6. [src/utils/githubWebhook.ts](src/utils/githubWebhook.ts)
7. [frontend/dashboard.html](frontend/dashboard.html)

---

## 17. Resumo rápido por camada

- Frontend/painel: [frontend/index.html](frontend/index.html), [frontend/login.html](frontend/login.html), [frontend/dashboard.html](frontend/dashboard.html), [frontend/app.html](frontend/app.html)
- API/rotas: [src/app.ts](src/app.ts), [src/routes](src/routes)
- Lógica: [src/controllers](src/controllers), [src/services](src/services)
- Integração com infraestrutura: [src/utils](src/utils), [src/workers](src/workers)
- Persistência: [prisma/schema.prisma](prisma/schema.prisma)
- Execução assíncrona: [src/queues/deployQueue.ts](src/queues/deployQueue.ts)

Se quiser, no próximo passo eu também posso transformar isso em uma versão ainda mais organizada em tópicos de “arquivo → função → dependência → ponto de atenção”.
