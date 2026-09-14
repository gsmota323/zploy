# Documentação dos arquivos do projeto Zploy

Este arquivo reúne uma explicação prática do papel de cada parte do repositório, com foco em facilitar a consulta durante o desenvolvimento e a apresentação do TCC.

## 1. Visão geral do projeto

O Zploy é uma plataforma para automação de deploy de aplicações web utilizando containers Docker.

O sistema permite:

- criar aplicativos;
- autenticar usuários;
- disparar deploys manualmente;
- disparar deploys por webhook do GitHub;
- clonar repositórios GitHub;
- detectar aplicações Node.js e Python;
- gerar Dockerfiles automaticamente quando necessário;
- aceitar Dockerfiles personalizados;
- construir imagens Docker;
- executar aplicações em containers;
- acompanhar logs e status dos deploys;
- configurar variáveis de ambiente por aplicação.

A arquitetura é dividida em:

- API Express para receber requisições;
- Controllers para tratar as requisições;
- Services para concentrar regras de negócio;
- Prisma + PostgreSQL para persistência;
- Redis + BullMQ para processamento assíncrono;
- Worker para executar os deploys em background;
- Docker para construção e execução das aplicações;
- Painel web para interação com o sistema.

---

## 2. Arquivos raiz do repositório

### [package.json](package.json)

Define as dependências do projeto, os scripts de execução e as ferramentas utilizadas.

Entre os principais comandos estão:

- `npm run dev`: inicia a API em modo de desenvolvimento;
- `npm run worker`: inicia o worker de deploy;
- `npm run build`: compila o projeto TypeScript;
- `npm run prisma:generate`: gera o Prisma Client;
- `npm run prisma:migrate`: executa as migrations do Prisma;
- `npm start`: inicia os serviços necessários para execução do projeto.

### [docker-compose.yml](docker-compose.yml)

Configura os serviços utilizados pelo Zploy:

- PostgreSQL: banco de dados da aplicação;
- Redis: utilizado pelo sistema de filas de deploy.

### [prisma.config.ts](prisma.config.ts)

Contém a configuração utilizada pelo Prisma no projeto.

### [tsconfig.json](tsconfig.json)

Configura o TypeScript, incluindo opções de compilação e suporte aos módulos utilizados pelo projeto.

### [README.md](README.md)

Documento principal do projeto, contendo informações de instalação, execução e utilização.

### [ROTEIRO.md](ROTEIRO.md)

Contém um roteiro de execução e organização utilizado durante o desenvolvimento e apresentação do projeto.

### [.env](.env)

Arquivo de variáveis de ambiente utilizado localmente.

Pode conter informações como:

- URL do banco de dados;
- segredo utilizado pelo JWT;
- segredo do webhook do GitHub;
- chave utilizada para criptografia das variáveis de ambiente.

Este arquivo não deve ser versionado publicamente.

---

## 3. Estrutura do banco de dados

### [prisma/schema.prisma](prisma/schema.prisma)

Define os modelos utilizados pelo banco de dados.

Os principais modelos são:

- `User`: representa os usuários;
- `App`: representa cada aplicação cadastrada;
- `Deploy`: representa uma tentativa de deploy;
- `DeployLog`: armazena os logs de cada deploy;
- `EnvVar`: armazena variáveis de ambiente de cada aplicação.

Este arquivo é uma das principais referências para entender a estrutura de persistência do sistema.

### [prisma/seed.ts](prisma/seed.ts)

Insere dados iniciais no banco de dados para facilitar os testes do sistema.

### [prisma/migrations](prisma/migrations)

Contém as migrations utilizadas pelo Prisma para controlar a evolução do banco de dados.

---

## 4. Estrutura principal da aplicação

### [src/app.ts](src/app.ts)

É o ponto central da aplicação Express.

Suas principais responsabilidades são:

- configurar o Express;
- habilitar CORS e JSON;
- configurar middlewares;
- registrar as rotas da API;
- disponibilizar os arquivos do frontend;
- disponibilizar configurações públicas necessárias ao frontend;
- receber webhooks do GitHub.

### [src/server.ts](src/server.ts)

Inicializa o servidor HTTP e faz a aplicação escutar na porta configurada, normalmente a porta 3000.

---

## 5. Rotas

### [src/routes/authRoutes.ts](src/routes/authRoutes.ts)

Define as rotas relacionadas à autenticação:

- cadastro;
- login.

### [src/routes/userRoutes.ts](src/routes/userRoutes.ts)

Define as rotas relacionadas ao usuário.

### [src/routes/appRoutes.ts](src/routes/appRoutes.ts)

Agrupa as rotas relacionadas às aplicações:

- criar aplicação;
- listar aplicações;
- consultar aplicação;
- remover aplicação;
- disparar deploy;
- reexecutar deploy;
- gerenciar variáveis de ambiente;
- parar aplicação.

### [src/routes/deployRoutes.ts](src/routes/deployRoutes.ts)

Define as rotas relacionadas aos deploys, principalmente a consulta dos logs.

---

## 6. Controllers

### [src/controllers/authController.ts](src/controllers/authController.ts)

Controla as requisições de autenticação.

Responsável pelo fluxo de:

- cadastro;
- login.

### [src/controllers/userController.ts](src/controllers/userController.ts)

Controla as operações relacionadas aos usuários.

### [src/controllers/appController.ts](src/controllers/appController.ts)

Controla as operações relacionadas às aplicações.

Entre suas responsabilidades estão:

- criar aplicação;
- listar aplicações;
- consultar aplicação;
- remover aplicação;
- iniciar deploy;
- reexecutar deploy.

### [src/controllers/deployController.ts](src/controllers/deployController.ts)

Controla operações relacionadas aos deploys.

Suas principais responsabilidades são:

- iniciar um deploy;
- validar os dados recebidos;
- criar o registro do deploy;
- enviar o deploy para a fila;
- consultar logs;
- parar uma aplicação em execução.

### [src/controllers/envController.ts](src/controllers/envController.ts)

Controla as operações relacionadas às variáveis de ambiente das aplicações.

Também realiza verificações para garantir que o usuário possui acesso à aplicação.

---

## 7. Services

### [src/services/authService.ts](src/services/authService.ts)

Contém a lógica de autenticação.

Entre suas responsabilidades estão:

- localizar o usuário;
- verificar a senha;
- utilizar bcrypt para comparação de senhas;
- gerar tokens JWT.

### [src/services/userService.ts](src/services/userService.ts)

Responsável pelas operações relacionadas aos usuários.

Também realiza o armazenamento seguro das senhas utilizando hash.

### [src/services/appService.ts](src/services/appService.ts)

Concentra regras de negócio relacionadas às aplicações.

É utilizado para:

- criar aplicações;
- buscar aplicações;
- remover aplicações;
- controlar recursos relacionados a uma aplicação.

### [src/services/envService.ts](src/services/envService.ts)

Gerencia as variáveis de ambiente das aplicações.

Permite:

- adicionar variáveis;
- listar variáveis;
- atualizar variáveis;
- remover variáveis.

### [src/services/deployLogService.ts](src/services/deployLogService.ts)

Centraliza a criação e consulta dos logs de deploy armazenados no banco.

---

## 8. Middlewares

### [src/middlewares/authMiddleware.ts](src/middlewares/authMiddleware.ts)

Responsável pela autenticação das requisições.

Quando a autenticação está habilitada, o middleware:

1. lê o token JWT;
2. valida o token;
3. identifica o usuário;
4. disponibiliza o `userId` para os controllers.

### [src/middlewares/rateLimiter.ts](src/middlewares/rateLimiter.ts)

Controla a quantidade de requisições permitidas em determinados períodos.

É utilizado para reduzir abusos e proteger endpoints importantes da API.

---

## 9. Configuração e conexões externas

### [src/config/prisma.ts](src/config/prisma.ts)

Cria e disponibiliza a instância do Prisma Client utilizada pela aplicação.

### [src/config/redis.ts](src/config/redis.ts)

Configura a conexão com o Redis.

O Redis é utilizado principalmente pelo BullMQ para armazenar e processar a fila de deploys.

---

## 10. Fila e worker de deploy

### [src/queues/deployQueue.ts](src/queues/deployQueue.ts)

Define a fila de deploy utilizando BullMQ.

Quando um usuário solicita um deploy, a API cria um job e o coloca nessa fila.

Isso permite que o processamento pesado do deploy seja realizado separadamente da requisição HTTP.

### [src/workers/deployWorker.ts](src/workers/deployWorker.ts)

É o principal componente responsável pela execução dos deploys.

O fluxo principal é:

1. receber o job da fila;
2. validar os dados;
3. criar um diretório temporário;
4. clonar o repositório;
5. identificar o tipo de aplicação;
6. localizar ou gerar um Dockerfile;
7. preparar as variáveis de ambiente;
8. construir a imagem Docker;
9. executar o container;
10. atualizar o status da aplicação;
11. registrar os logs;
12. remover arquivos temporários.

O uso de um worker permite que o processo de build e execução não bloqueie a API.

---

## 11. Providers de deployment

### [src/services/deployment/deploymentProvider.ts](src/services/deployment/deploymentProvider.ts)

Define a interface utilizada para operações de execução das aplicações.

Ela estabelece operações como:

- deploy;
- parada;
- remoção de recursos.

Essa abstração permite separar a lógica do deploy da tecnologia responsável pela execução dos containers.

### [src/services/deployment/dockerProvider.ts](src/services/deployment/dockerProvider.ts)

Implementa o provider utilizado atualmente pelo Zploy.

É responsável por:

- criar e executar containers Docker;
- escolher uma porta disponível;
- configurar variáveis de ambiente;
- associar a porta do container a uma porta do host;
- parar containers;
- remover containers.

---

## 12. Utilitários

### [src/utils/githubWebhook.ts](src/utils/githubWebhook.ts)

Centraliza a lógica relacionada aos webhooks do GitHub.

Entre suas responsabilidades estão:

- validar URLs de repositórios;
- normalizar URLs;
- verificar eventos recebidos;
- validar assinaturas;
- verificar se o webhook pertence ao aplicativo correto.

### [src/utils/dockerfile.ts](src/utils/dockerfile.ts)

Auxilia na preparação dos containers.

É responsável por:

- identificar características da aplicação;
- inferir a porta utilizada;
- gerar Dockerfiles para aplicações Node.js;
- gerar Dockerfiles para aplicações Python;
- aceitar Dockerfiles personalizados.

### [src/utils/runCommandWithLogs.ts](src/utils/runCommandWithLogs.ts)

Executa comandos do sistema operacional e captura sua saída para registro nos logs do deploy.

### [src/utils/deployLock.ts](src/utils/deployLock.ts)

Implementa o mecanismo de lock distribuído utilizado para evitar que múltiplos deploys da mesma aplicação sejam executados simultaneamente.

O Redis é utilizado para controlar esse lock.

### [src/utils/envCrypto.ts](src/utils/envCrypto.ts)

Responsável pela criptografia das variáveis de ambiente armazenadas pelo sistema.

### [src/utils/envKeyValidation.ts](src/utils/envKeyValidation.ts)

Valida os nomes das variáveis de ambiente antes que sejam armazenados ou utilizados.

---

## 13. Interface web

### [frontend/index.html](frontend/index.html)

Landing page do Zploy.

Apresenta o sistema e direciona o usuário para as áreas de autenticação e utilização da plataforma.

### [frontend/login.html](frontend/login.html)

Tela de autenticação.

Permite:

- fazer login;
- criar uma conta.

### [frontend/dashboard.html](frontend/dashboard.html)

Painel principal das aplicações.

Permite:

- listar aplicações;
- criar aplicações;
- acessar os detalhes de uma aplicação.

### [frontend/app.html](frontend/app.html)

Página de detalhes de uma aplicação.

Permite:

- iniciar deploy;
- acompanhar logs;
- visualizar o status da aplicação;
- configurar variáveis de ambiente;
- parar a aplicação;
- remover a aplicação.

### [frontend/js/api.js](frontend/js/api.js)

Centraliza as chamadas realizadas pelo frontend para a API do Zploy.

---

## 14. Pasta temporária de deploy

### [temp-deploys](temp-deploys)

Diretório utilizado temporariamente durante o processo de deploy.

O worker utiliza essa pasta para:

- clonar o repositório;
- acessar os arquivos da aplicação;
- gerar ou utilizar o Dockerfile;
- construir a imagem Docker.

Os arquivos utilizados durante o processo podem ser removidos após a conclusão do deploy.

---

## 15. Fluxo de execução típico

Um deploy completo normalmente segue este caminho:

1. O usuário acessa o painel.
2. O usuário cria uma aplicação.
3. O usuário informa o repositório GitHub.
4. O deploy é solicitado manualmente ou através de um webhook.
5. A API valida a solicitação.
6. O controller cria um registro de deploy no banco.
7. O job é enviado para a fila BullMQ.
8. O worker recebe o job.
9. O repositório é clonado.
10. A aplicação é analisada.
11. Um Dockerfile é localizado ou gerado.
12. A imagem Docker é construída.
13. O container é executado.
14. O status da aplicação é atualizado.
15. Os logs são armazenados no banco.
16. O painel apresenta o resultado ao usuário.

---

## 16. Tecnologias principais

### Node.js

Ambiente de execução utilizado pelo backend.

### TypeScript

Linguagem utilizada no desenvolvimento do backend.

### Express

Framework utilizado para criação da API HTTP.

### PostgreSQL

Banco de dados relacional utilizado para armazenar usuários, aplicações, deploys, logs e variáveis de ambiente.

### Prisma

ORM utilizado para comunicação entre a aplicação e o PostgreSQL.

### Redis

Sistema utilizado como infraestrutura para a fila de processamento e para mecanismos de controle distribuído.

### BullMQ

Biblioteca utilizada para criação e processamento assíncrono da fila de deploys.

### Docker

Tecnologia utilizada para criar imagens e executar as aplicações em containers.

### GitHub

Fonte dos repositórios utilizados nos deploys e origem dos webhooks de atualização.

---

## 17. Onde olhar primeiro

Para entender rapidamente o funcionamento do Zploy, recomenda-se seguir esta ordem:

1. [src/app.ts](src/app.ts)
2. [src/routes/appRoutes.ts](src/routes/appRoutes.ts)
3. [src/controllers/appController.ts](src/controllers/appController.ts)
4. [src/controllers/deployController.ts](src/controllers/deployController.ts)
5. [src/queues/deployQueue.ts](src/queues/deployQueue.ts)
6. [src/workers/deployWorker.ts](src/workers/deployWorker.ts)
7. [src/services/deployment/dockerProvider.ts](src/services/deployment/dockerProvider.ts)
8. [src/utils/dockerfile.ts](src/utils/dockerfile.ts)
9. [prisma/schema.prisma](prisma/schema.prisma)
10. [frontend/dashboard.html](frontend/dashboard.html)

---

## 18. Resumo por camada

### Frontend

- `frontend/index.html`
- `frontend/login.html`
- `frontend/dashboard.html`
- `frontend/app.html`
- `frontend/js/api.js`

### API e rotas

- `src/app.ts`
- `src/server.ts`
- `src/routes`

### Controllers

- `src/controllers`

### Regras de negócio

- `src/services`

### Deploy

- `src/queues/deployQueue.ts`
- `src/workers/deployWorker.ts`
- `src/services/deployment`
- `src/utils/dockerfile.ts`
- `src/utils/runCommandWithLogs.ts`
- `src/utils/deployLock.ts`

### Persistência

- `prisma/schema.prisma`
- `src/config/prisma.ts`

### Infraestrutura

- PostgreSQL
- Redis
- Docker

### Integrações

- GitHub
- Webhooks