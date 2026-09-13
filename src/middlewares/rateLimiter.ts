import rateLimit from "express-rate-limit";

/**
 * Limite restritivo para rotas de autenticação (login e cadastro).
 * Protege contra ataques de força bruta e credential stuffing.
 * Janela: 15 minutos | Limite: 20 requisições por IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas tentativas de autenticação a partir deste IP. Tente novamente após 15 minutos.",
  },
});

/**
 * Limite de proteção para endpoints de início de deploy.
 * Evita enfileiramento excessivo de builds e sobrecarga do worker/cluster.
 * Janela: 15 minutos | Limite: 15 requisições por IP
 */
export const deployLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas solicitações de deploy iniciadas. Aguarde alguns minutos antes de tentar novamente.",
  },
});

/**
 * Limite suave para endpoints de API gerais (listagens, detalhes, dashboard).
 * Garante proteção contra abuso sem impactar navegação, leituras ou polling do frontend.
 * Janela: 15 minutos | Limite: 300 requisições por IP
 */
export const apiGeneralLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Limite geral de requisições excedido. Tente novamente mais tarde.",
  },
});
