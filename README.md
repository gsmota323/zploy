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
- src/index.html: painel web simples

## Requisitos

- Node.js 18+
- Docker instalado e rodando
- PostgreSQL rodando localmente
- Redis rodando localmente
- Kubernetes opcional para deploys no cluster

## Variáveis de ambiente

Crie um arquivo .env com algo semelhante:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tcc_db"
JWT_SECRET="zploy-secret"
GITHUB_WEBHOOK_SECRET=""
```

## Instalação

```bash
npm install
npx prisma generate
npx prisma migrate dev
```

## Execução

Inicie a API:

```bash
npm run dev
```

Inicie o worker de deploy:

```bash
npm run worker
```

Abra o painel em:

```bash
http://localhost:3000/
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
