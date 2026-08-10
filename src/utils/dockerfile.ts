export type RuntimeType = "Node" | "Python";

export function inferContainerPort(dockerfileContent: string, runtime: RuntimeType) {
  const normalized = dockerfileContent.toLowerCase();
  const portMatch = normalized.match(/expose\s+(\d+)/);
  if (portMatch) {
    return Number(portMatch[1]);
  }

  return runtime === "Node" ? 5006 : 8000;
}

export function resolveDockerfileContent({
  runtime,
  customDockerfile,
}: {
  runtime: RuntimeType;
  customDockerfile?: string;
}) {
  if (customDockerfile && customDockerfile.trim()) {
    return customDockerfile.trim();
  }

  if (runtime === "Node") {
    return `
FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
ENV PORT=5006
EXPOSE 5006
CMD ["npm", "start"]
    `.trim();
  }

  return `
FROM python:3.9-slim
WORKDIR /usr/src/app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8000
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
    `.trim();
}
