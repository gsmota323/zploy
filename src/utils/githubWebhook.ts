import crypto from "crypto";

export function shouldHandleGithubEvent(event?: string) {
  return event === "push" || event === "ping";
}

export function normalizeRepositoryUrl(value?: string | null) {
  if (!value) return undefined;

  const trimmed = String(value).trim();
  if (!trimmed) return undefined;

  let normalized = trimmed.replace(/\/+$/, "");
  normalized = normalized.replace(/^git\+/, "");

  if (normalized.startsWith("git@github.com:")) {
    normalized = normalized.replace("git@github.com:", "https://github.com/");
  } else if (normalized.startsWith("ssh://git@github.com/")) {
    normalized = normalized.replace("ssh://git@github.com/", "https://github.com/");
  } else if (/^git@[^:]+:/.test(normalized)) {
    normalized = normalized.replace(/^git@[^:]+:/, "https://");
  }

  if (normalized.startsWith("https://github.com/")) {
    normalized = normalized.replace(/\.git$/i, "");
  }

  return normalized;
}

export function verifyGithubSignature(payload: string, signature?: string | string[]) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return true;

  const providedSignature = Array.isArray(signature) ? signature[0] : signature;
  if (!providedSignature) return false;

  const expectedSignature = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature));
  } catch {
    return false;
  }
}

export function repositoryMatches(appRepositoryUrl?: string | null, incomingRepositoryUrl?: string | null) {
  const appRepo = normalizeRepositoryUrl(appRepositoryUrl);
  const incomingRepo = normalizeRepositoryUrl(incomingRepositoryUrl);

  if (!appRepo || !incomingRepo) {
    return false;
  }

  return appRepo.toLowerCase() === incomingRepo.toLowerCase();
}

export function getWebhookRepositoryUrl(payload?: any) {
  const repository = payload?.repository;
  const candidates = [
    repository?.html_url,
    repository?.clone_url,
    repository?.full_name ? `https://github.com/${repository.full_name}` : undefined,
  ];

  return normalizeRepositoryUrl(candidates.find(Boolean));
}
