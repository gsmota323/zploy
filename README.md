# Zploy

Zploy é uma plataforma de deploy local/protótipo inspirada em um PaaS, construída com Node.js, TypeScript, Express, Prisma, PostgreSQL, Redis, BullMQ e Docker. O projeto permite criar apps, disparar deploys, acompanhar logs e integrar com GitHub via webhook.

## Funcionalidades

- Autenticação com JWT
- CRUD de apps
- Deploy assíncrono com fila Redis/BullMQ
- Build de imagens Docker
- Publicação local via Docker ou Kubernetes (quando disponível)
- Logs de deploy
- Webhook do GitHub para disparar deploys após push
- Suporte a branch configurável por app
- Painel web simples para operar a plataforma

## Tecnologias

- Node.js + TypeScript
- Express
- Prisma + PostgreSQL
- Redis + BullMQ
- Docker
- Kubernetes (opcional, local)

## Estrutura do projeto

- src/app.ts: aplicação Express principal
- src/controllers: controladores HTTP
- src/services: regras de negócio
- src/workers/deployWorker.ts: worker de deploy
- src/queues/deployQueue.ts: fila de deploys
- src/utils: utilitários de Docker, Kubernetes e webhook
- prisma/: schema e migrations do banco
- frontend/: painel web atual (index, login, dashboard e app)

## Requisitos

- Node.js 18+
- Docker instalado e rodando
- Kubernetes opcional para deploys no cluster

## Variáveis de ambiente

Crie um arquivo .env com algo semelhante:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tcc_db"
JWT_SECRET="zploy-secret"
GITHUB_WEBHOOK_SECRET=""
AUTH_ENABLED="true"
REQUIRE_KUBERNETES="false"
```

`AUTH_ENABLED` controla o comportamento da autenticação:

- `AUTH_ENABLED=true`: modo plataforma (login e registro ativos)
- `AUTH_ENABLED=false`: modo estudo (sem login; dashboard direto com usuário local automático)

`REQUIRE_KUBERNETES` controla o fallback do worker:

- `REQUIRE_KUBERNETES=true`: não permite fallback para Docker local (deploy falha se Kubernetes estiver indisponível)
- `REQUIRE_KUBERNETES=false`: fallback para Docker local habilitado

Perfis prontos no repositório:

- `.env.platform`: configuração para modo plataforma
- `.env.study`: configuração para modo estudo

Para alternar rapidamente no Windows (PowerShell):

```powershell
Copy-Item .env.study .env -Force
```

ou

```powershell
Copy-Item .env.platform .env -Force
```

## Instalação

```bash
npm install
npx prisma generate
npx prisma migrate dev
```

## Execução

A forma mais simples de rodar o projeto agora é com um único comando:

```bash
npm run start
```

Esse comando irá:

- subir o PostgreSQL e o Redis com Docker Compose
- iniciar a API
- iniciar o worker de deploy

Depois, abra o painel em:

```bash
http://localhost:3000/
```

Se quiser rodar os processos separadamente, ainda é possível usar:

```bash
npm run dev
npm run worker
```

### Modo Kubernetes completo (sem fallback)

Para subir o Minikube automaticamente e iniciar a plataforma exigindo Kubernetes:

```bash
npm run start:k8s
```

Esse comando:

- roda `minikube start`
- habilita addons `ingress` e `metrics-server`
- inicia o Zploy com `REQUIRE_KUBERNETES=true`

### Modos de uso

- Modo plataforma: mantenha `AUTH_ENABLED=true`
- Modo estudo: defina `AUTH_ENABLED=false`

### Modo demo (tudo em container)

Para rodar API, worker, PostgreSQL e Redis em containers:

```bash
npm run demo:up
```

Para parar os containers do modo demo (sem remover):

```bash
npm run demo:down
```

Para remover containers e rede do modo demo:

```bash
npm run demo:clean
```

No modo demo, o backend fica disponível em:

```bash
http://localhost:3001/
```

Se quiser usar outra porta no host:

```bash
APP_PORT=3005 npm run demo:up
```

## Como usar

1. Registre um usuário e faça login.
2. Crie um app.
3. Informe o repositório GitHub e a branch desejada.
4. Dispare um deploy manualmente ou configure um webhook do GitHub.
5. Acompanhe os logs e o status do deploy no painel.

## Webhook do GitHub

A rota do webhook está disponível em:

```txt
POST /webhooks/github
```

No GitHub, configure um webhook no repositório com:

- URL: sua URL do Zploy + /webhooks/github
- Evento: push
- Content type: application/json

Se quiser, você também pode usar a secret `GITHUB_WEBHOOK_SECRET` para validar a assinatura do webhook.

## Observações

- O projeto ainda é um protótipo local e pode precisar de ajustes para ambiente real.
- Para deploys mais completos em Kubernetes, o cluster precisa estar disponível.
- Em alguns cenários, o deploy pode cair para fallback com Docker local.

## Próximos melhorias sugeridas

- histórico de deploys mais detalhado
- rollback automático mais refinado
- suporte a múltiplas branches e tags
- melhor UX no painel
- autenticação do webhook com secret reforçada
