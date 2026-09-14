# Zploy

Zploy é uma plataforma de deploy local/protótipo inspirada em um PaaS, construída com Node.js, TypeScript, Express, Prisma, PostgreSQL, Redis, BullMQ e Docker.

O projeto permite criar aplicações, disparar deploys, acompanhar logs e integrar com o GitHub por meio de webhooks.

## Funcionalidades

* Autenticação configurável com JWT
* CRUD de aplicações
* Deploy assíncrono com fila Redis/BullMQ
* Build de imagens Docker
* Publicação local via Docker
* Logs de deploy
* Webhook do GitHub para disparar deploys após push
* Suporte a branch configurável por aplicação
* Painel web para operação da plataforma
* Modo local sem autenticação

## Tecnologias

* Node.js + TypeScript
* Express
* Prisma + PostgreSQL
* Redis + BullMQ
* Docker

## Estrutura do projeto

```text
src/app.ts                    Aplicação Express principal
src/controllers/              Controladores HTTP
src/services/                 Regras de negócio
src/workers/deployWorker.ts   Worker responsável pelos deploys
src/queues/deployQueue.ts     Fila de deploys
src/utils/                    Utilitários de Docker, deploy e webhook
prisma/                       Schema e migrations do banco
frontend/                     Painel web
```

## Requisitos

* Node.js 18+
* Docker instalado e em execução

## Variáveis de ambiente

Crie um arquivo `.env` a partir do template:

### Windows PowerShell

```powershell
Copy-Item .env.example .env -Force
```

### Linux/macOS

```bash
cp .env.example .env
```

Na branch `local`, o arquivo `.env.example` utiliza:

```env
AUTH_ENABLED=false
```

Com `AUTH_ENABLED=false`, o sistema funciona sem exigir login, utilizando automaticamente o usuário local configurado nas variáveis:

```env
LOCAL_DEV_EMAIL=study@zploy.local
LOCAL_DEV_USERNAME=study
LOCAL_DEV_PASSWORD=<CHANGE_ME>
```

As principais variáveis utilizadas pelo projeto incluem:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tcc_db"

JWT_SECRET="zploy-secret"

GITHUB_WEBHOOK_SECRET=""

AUTH_ENABLED="false"

LOCAL_DEV_EMAIL="study@zploy.local"
LOCAL_DEV_USERNAME="study"
LOCAL_DEV_PASSWORD="CHANGE_ME"
```

> **Importante:** o arquivo `.env` não deve ser versionado. Utilize `.env.example` como referência e mantenha os valores reais apenas no `.env` local.

## Instalação

Instale as dependências:

```bash
npm install
```

Gere o cliente Prisma:

```bash
npx prisma generate
```

Execute as migrations:

```bash
npx prisma migrate dev
```

## Execução

A forma recomendada de iniciar o projeto é:

```bash
npm run up
```

Esse comando inicia:

* PostgreSQL
* Redis
* API
* Worker de deploy

Para encerrar os serviços:

```bash
npm run down
```

### Execução separada

Caso seja necessário executar os processos separadamente:

```bash
npm run dev
```

Em outro terminal:

```bash
npm run worker
```

## Acesso ao painel

Após iniciar o projeto, acesse:

```text
http://localhost:3000/
```

No **Modo Local**, a autenticação é desabilitada e o sistema utiliza automaticamente o usuário local configurado no `.env`.

## Modos de uso

O comportamento da autenticação é controlado pela variável `AUTH_ENABLED`.

### Modo Local

```env
AUTH_ENABLED=false
```

Nesse modo:

* não é necessário realizar login;
* o sistema utiliza um usuário local automático;
* o painel pode ser acessado diretamente.

### Modo Plataforma

```env
AUTH_ENABLED=true
```

Nesse modo:

* o login é habilitado;
* o registro de usuários é habilitado;
* as rotas protegidas utilizam autenticação JWT.

Para utilizar o Modo Plataforma, altere `AUTH_ENABLED` no `.env` antes de iniciar a aplicação.

## Como usar

1. Acesse o painel web.
2. No Modo Plataforma, registre um usuário e faça login.
3. Crie uma aplicação.
4. Informe o repositório GitHub e a branch desejada.
5. Dispare um deploy manualmente ou configure um webhook do GitHub.
6. Acompanhe os logs e o status do deploy no painel.

No Modo Local, o acesso ocorre diretamente com o usuário local automático.

## Webhook do GitHub

A rota do webhook está disponível em:

```text
POST /webhooks/github
```

No GitHub, configure um webhook no repositório utilizando:

* **URL:** endereço do Zploy + `/webhooks/github`
* **Evento:** `push`
* **Content-Type:** `application/json`

Opcionalmente, configure `GITHUB_WEBHOOK_SECRET` para validar a assinatura dos webhooks recebidos.

## Comandos disponíveis

Os principais comandos definidos no projeto são:

```bash
npm run up
npm run down
npm run dev
npm run worker
npm run build
npm run prisma:generate
npm run prisma:migrate
```

| Comando                   | Função                                 |
| ------------------------- | -------------------------------------- |
| `npm run up`              | Inicia PostgreSQL, Redis, API e worker |
| `npm run down`            | Encerra os serviços                    |
| `npm run dev`             | Inicia a API em modo desenvolvimento   |
| `npm run worker`          | Inicia o worker de deploy              |
| `npm run build`           | Compila o projeto TypeScript           |
| `npm run prisma:generate` | Gera o cliente Prisma                  |
| `npm run prisma:migrate`  | Executa as migrations do banco         |

## Observações

* O projeto é um protótipo de deploy local.
* Os deploys das aplicações são executados utilizando containers Docker.
* O ambiente foi desenvolvido com foco em demonstração, estudo e validação da arquitetura proposta.

## Melhorias futuras

* Histórico de deploys mais detalhado
* Rollback automático mais refinado
* Suporte a múltiplas branches e tags
* Melhorias na experiência de uso do painel
* Reforço da autenticação dos webhooks
* Evolução da arquitetura para ambientes de produção
