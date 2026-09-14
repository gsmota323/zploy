import express from "express";
import path from "path";
const cors = require("cors");

import userRoutes from "./routes/userRoutes";
import authRoutes from "./routes/authRoutes";
import appRoutes from "./routes/appRoutes";
import deployRoutes from "./routes/deployRoutes";

import prisma from "./config/prisma";
import { addDeployJob } from "./queues/deployQueue";

import {
  getWebhookRepositoryUrl,
  repositoryMatches,
  shouldHandleGithubEvent,
  verifyGithubSignature,
} from "./utils/githubWebhook";

import helmet from "helmet";
import { apiGeneralLimiter } from "./middlewares/rateLimiter";

const app = express();

// ============================================================
// CONFIGURAÇÃO DE PROXY
// ============================================================

// Número de "hops" de reverse proxy confiáveis
// (para X-Forwarded-* / express-rate-limit).
//
// Padrão seguro: nenhum proxy confiável.
// Útil para o Zploy Local, sem proxy na frente.
//
// Configure TRUST_PROXY_HOPS (ex.: "1") quando o Zploy Platform
// estiver atrás de um reverse proxy/load balancer.
function resolveTrustProxyHops(): number | false {
  const raw = process.env.TRUST_PROXY_HOPS;

  if (raw === undefined || raw.trim() === "") {
    return false;
  }

  const hops = Number(raw);

  if (!Number.isInteger(hops) || hops < 0) {
    console.warn(
      `TRUST_PROXY_HOPS inválido ("${raw}"); ignorando X-Forwarded-* (comportamento seguro).`
    );

    return false;
  }

  return hops === 0 ? false : hops;
}

app.set("trust proxy", resolveTrustProxyHops());

// ============================================================
// MODO DE AUTENTICAÇÃO
// ============================================================

function isAuthEnabled() {
  return process.env.AUTH_ENABLED !== "false";
}

// ============================================================
// MIDDLEWARES
// ============================================================

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
  })
);

app.use(
  express.json({
    limit: "256kb",
    verify: (req, _res, buf) => {
      const expressReq = req as express.Request & {
        rawBody?: Buffer;
      };

      if (expressReq.originalUrl === "/webhooks/github") {
        expressReq.rawBody = Buffer.from(buf);
      }
    },
  })
);

app.use(helmet());

// ============================================================
// ROTAS DA API
// ============================================================

app.use("/users", apiGeneralLimiter, userRoutes);
app.use("/auth", authRoutes);
app.use("/apps", apiGeneralLimiter, appRoutes);

// ============================================================
// HOMEPAGE
// ============================================================
//
// Plataforma:
//   / -> Homepage
//
// Local:
//   / -> Dashboard
//
// ============================================================

app.get("/", (req, res) => {
  if (!isAuthEnabled()) {
    return res.redirect("/dashboard.html");
  }

  return res.sendFile(
    path.join(process.cwd(), "frontend", "index.html")
  );
});

// ============================================================
// LOGIN
// ============================================================
//
// Plataforma:
//   /login       -> Login
//   /login.html  -> Login
//
// Local:
//   /login       -> Dashboard
//   /login.html  -> Dashboard
//
// ============================================================

app.get(["/login", "/login.html"], (req, res) => {
  if (!isAuthEnabled()) {
    return res.redirect("/dashboard.html");
  }

  return res.sendFile(
    path.join(process.cwd(), "frontend", "login.html")
  );
});

// ============================================================
// DASHBOARD
// ============================================================

app.get(["/dashboard", "/dashboard.html"], (req, res) => {
  return res.sendFile(
    path.join(process.cwd(), "frontend", "dashboard.html")
  );
});

// ============================================================
// APP / DEPLOY
// ============================================================

app.get(["/app", "/app.html"], (req, res) => {
  return res.sendFile(
    path.join(process.cwd(), "frontend", "app.html")
  );
});

// ============================================================
// FRONTEND ESTÁTICO
// ============================================================
//
// Mantido depois das rotas principais para que:
// - /login.html passe primeiro pela regra de autenticação
// - /dashboard.html passe primeiro pela rota da Dashboard
// - /app.html passe primeiro pela rota do App
//
// ============================================================

app.use(
  "/frontend",
  express.static(path.join(process.cwd(), "frontend"))
);

app.use(
  express.static(path.join(process.cwd(), "frontend"))
);

// ============================================================
// CONFIGURAÇÃO PÚBLICA
// ============================================================

app.get("/config/public", (req, res) => {
  return res.json({
    authEnabled: isAuthEnabled(),
  });
});

// ============================================================
// WEBHOOK DO GITHUB
// ============================================================

app.post("/webhooks/github", async (req, res) => {
  try {
    const event = req.headers["x-github-event"];

    if (
      !shouldHandleGithubEvent(
        typeof event === "string" ? event : undefined
      )
    ) {
      return res.status(202).json({
        ok: true,
        ignored: true,
      });
    }

    const signature = Array.isArray(
      req.headers["x-hub-signature-256"]
    )
      ? req.headers["x-hub-signature-256"][0]
      : req.headers["x-hub-signature-256"];

    const rawBody = (
      req as express.Request & {
        rawBody?: Buffer;
      }
    ).rawBody;

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

    const branch =
      req.body?.ref?.replace("refs/heads/", "") || "main";

    if (!repositoryUrl) {
      return res.status(400).json({
        error: "Repository não fornecido no webhook.",
      });
    }

    const apps = await prisma.app.findMany({
      where: {
        repositoryUrl: {
          not: null,
        },
      },
    });

    const app = apps.find((candidate) =>
      repositoryMatches(
        candidate.repositoryUrl,
        repositoryUrl
      )
    );

    if (!app) {
      return res.status(404).json({
        error: "App não encontrado para este repositório.",
      });
    }

    const configuredBranch =
      (app as { deploymentBranch?: string })
        .deploymentBranch || "main";

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
      where: {
        id: app.id,
      },
      data: {
        repositoryUrl,
        status: "pending",
      },
    });

    await addDeployJob(
      app.id,
      repositoryUrl,
      newDeploy.id,
      undefined,
      branch
    );

    return res.json({
      ok: true,
      appId: app.id,
      branch,
      deployId: newDeploy.id,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    return res.status(500).json({
      error: "Erro ao processar webhook do GitHub.",
      details: message,
    });
  }
});

// ============================================================
// DEPLOYS
// ============================================================

app.use(
  "/deploys",
  apiGeneralLimiter,
  deployRoutes
);

// ============================================================
// ROTAS NÃO ENCONTRADAS
// ============================================================
//
// No modo Local:
// qualquer rota de página desconhecida -> Dashboard
//
// No modo Plataforma:
// qualquer rota desconhecida -> 404
//
// ============================================================

app.use((req, res) => {
  if (!isAuthEnabled()) {
    return res.redirect("/dashboard.html");
  }

  return res.status(404).send("Página não encontrada.");
});

export default app;