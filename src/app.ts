import express from "express";
import path from "path";
const cors = require("cors");
import userRoutes from "./routes/userRoutes";
import authRoutes from "./routes/authRoutes"; 
import appRoutes from "./routes/appRoutes";
import deployRoutes from "./routes/deployRoutes";
import kubernetesRoutes from "./routes/kubernetesRoutes";
import { PrismaClient } from "@prisma/client";
import { addDeployJob } from "./queues/deployQueue";
import { getWebhookRepositoryUrl, repositoryMatches, shouldHandleGithubEvent, verifyGithubSignature } from "./utils/githubWebhook";
import helmet from "helmet";

const prisma = new PrismaClient();

const app = express();

function isAuthEnabled() {
  return process.env.AUTH_ENABLED !== "false";
}

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
  })
);
app.use(
  express.json({
    limit: "256kb",
   verify: (req, _res, buf) => {
  const expressReq = req as express.Request & { rawBody?: Buffer };

  if (expressReq.originalUrl === "/webhooks/github") {
    expressReq.rawBody = Buffer.from(buf);
  }
},
  })
);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
  })
);

app.use(helmet());

// Serve o frontend estático
app.use("/frontend", express.static(path.join(process.cwd(), "frontend")));
app.use(express.static(path.join(process.cwd(), "frontend")));

app.use("/users", userRoutes);
app.use("/auth", authRoutes); 
app.use("/apps", appRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "frontend", "index.html"));
});

app.get(["/login", "/login.html"], (req, res) => {
  res.sendFile(path.join(process.cwd(), "frontend", "login.html"));
});

app.get(["/dashboard", "/dashboard.html"], (req, res) => {
  res.sendFile(path.join(process.cwd(), "frontend", "dashboard.html"));
});

app.get(["/app", "/app.html"], (req, res) => {
  res.sendFile(path.join(process.cwd(), "frontend", "app.html"));
});

app.get("/config/public", (req, res) => {
  res.json({
    authEnabled: isAuthEnabled(),
  });
});

app.post("/webhooks/github", async (req, res) => {
  try {
    const event = req.headers["x-github-event"];
    if (!shouldHandleGithubEvent(typeof event === "string" ? event : undefined)) {
      return res.status(202).json({ ok: true, ignored: true });
    }

    const signature = Array.isArray(req.headers["x-hub-signature-256"])
      ? req.headers["x-hub-signature-256"][0]
      : req.headers["x-hub-signature-256"];

    const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;

    if (!rawBody) {
      return res.status(400).json({
        error: "Payload bruto do webhook não disponível.",
      });
    }

    if (!verifyGithubSignature(rawBody, signature)) {
      return res.status(401).json({
        error: "Assinatura do webhook inválida.",
      });
    }

    const repositoryUrl = getWebhookRepositoryUrl(req.body);
    const branch = req.body?.ref?.replace("refs/heads/", "") || "main";

    if (!repositoryUrl) {
      return res.status(400).json({ error: "Repository não fornecido no webhook." });
    }

    const apps = await prisma.app.findMany({
      where: {
        repositoryUrl: { not: null },
      },
    });

    const app = apps.find((candidate) => repositoryMatches(candidate.repositoryUrl, repositoryUrl));

    if (!app) {
      return res.status(404).json({ error: "App não encontrado para este repositório." });
    }

    const configuredBranch = (app as { deploymentBranch?: string }).deploymentBranch || "main";
    if (configuredBranch !== branch) {
      return res.status(202).json({
        ok: true,
        ignored: true,
        reason: "branch-mismatch",
      });
    }

    const newDeploy = await prisma.deploy.create({
      data: {
        appId: app.id,
        status: "pending",
      },
    });

    await prisma.app.update({
      where: { id: app.id },
      data: { repositoryUrl, status: "pending" },
    });

    await addDeployJob(app.id, repositoryUrl, newDeploy.id, undefined, branch);

    return res.json({ ok: true, appId: app.id, branch, deployId: newDeploy.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: "Erro ao processar webhook do GitHub.", details: message });
  }
});

app.use("/deploys", deployRoutes);
app.use("/kubernetes", kubernetesRoutes);

export default app;