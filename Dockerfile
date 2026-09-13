FROM node:20-bookworm-slim AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

# Gera o Prisma Client (necessário para o tsc enxergar os tipos do model) e compila o TypeScript.
RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim AS production

WORKDIR /usr/src/app

ENV NODE_ENV=production

# git é usado para clonar repositórios e docker.io fornece o CLI para o worker
RUN apt-get update \
  && apt-get install -y --no-install-recommends git docker.io \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm install --omit=dev
RUN npx prisma generate

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/frontend ./frontend

EXPOSE 3000

# CMD padrão inicia a API. O worker roda em outro container/processo, sobrescrevendo o
# comando com: node dist/workers/deployWorker.js (ou "npm run start:worker").
CMD ["node", "dist/server.js"]
