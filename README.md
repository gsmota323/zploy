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

A forma mais simples de operar o projeto agora é com comandos padronizados de subir e descer:

```bash
npm run up
npm run down
```

Resumo dos comandos simplificados:

- `npm run up`: sobe modo local padrão (API + worker + postgres + redis)
- `npm run down`: encerra modo local padrão
- `npm run up:k8s`: sobe modo Kubernetes obrigatório
- `npm run down:k8s`: encerra modo Kubernetes e para o Minikube
- `npm run up:demo`: sobe modo demo totalmente em containers
- `npm run down:demo`: encerra modo demo e limpa os containers da demo

Compatibilidade: os comandos antigos (`start`, `start:k8s`, `demo:up`, etc.) continuam funcionando.

### Modo local padrão

Para subir:

```bash
npm run up
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
npm run up:k8s
```

Esse comando:

- roda `minikube start`
- habilita addons `ingress` e `metrics-server`
- inicia o Zploy com `REQUIRE_KUBERNETES=true`

Para acessar apps publicados no Kubernetes de forma estável no Windows (driver Docker), rode em outro terminal:

```bash
npm run k8s:expose
```

Esse comando mantém o `kubectl port-forward` com reconexão automática se a sessão cair.
Se a porta `8080` estiver ocupada, ele seleciona automaticamente a próxima porta livre e mostra a URL no terminal.

Depois, abra a aplicação em:

```bash
http://<nome-do-app>.localtest.me:8080
```

Exemplo:

```bash
http://app1.localtest.me:8080
```

Observação: o domínio de ingress é configurável por `KUBERNETES_INGRESS_DOMAIN` e o padrão agora é `localtest.me`.

### Modos de uso

- Modo plataforma: mantenha `AUTH_ENABLED=true`
- Modo estudo: defina `AUTH_ENABLED=false`

### Modo demo (tudo em container)

Para rodar API, worker, PostgreSQL e Redis em containers:

```bash
npm run up:demo
```

Para encerrar o modo demo:

```bash
npm run down:demo
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
