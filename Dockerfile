FROM node:20-bookworm-slim

WORKDIR /usr/src/app

# git é usado para clonar repositórios e docker.io fornece o CLI para o worker
RUN apt-get update \
  && apt-get install -y --no-install-recommends git docker.io \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
