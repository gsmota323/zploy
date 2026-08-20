const API_URL = window.location.origin;
const AUTH_MODE_KEY = 'zploy_auth_enabled';
let authModeCache = null;

function getToken() {
  return localStorage.getItem('zploy_token');
}

function setToken(token) {
  localStorage.setItem('zploy_token', token);
}

function clearSession() {
  localStorage.removeItem('zploy_token');
}

function isAuthEnabledCached() {
  const cached = localStorage.getItem(AUTH_MODE_KEY);
  if (cached === 'false') return false;
  if (cached === 'true') return true;
  return null;
}

async function getAuthMode() {
  if (authModeCache) return authModeCache;

  try {
    const res = await fetch(`${API_URL}/config/public`);
    const data = await res.json();
    authModeCache = {
      authEnabled: data?.authEnabled !== false,
    };
  } catch {
    authModeCache = {
      authEnabled: true,
    };
  }

  localStorage.setItem(AUTH_MODE_KEY, String(authModeCache.authEnabled));

  if (!authModeCache.authEnabled && !getToken()) {
    setToken('study-mode');
  }

  return authModeCache;
}

function isLoggedIn() {
  if (isAuthEnabledCached() === false) {
    return true;
  }

  return !!getToken();
}

async function requireAuth() {
  const mode = await getAuthMode();

  if (!mode.authEnabled) {
    return true;
  }

  if (!isLoggedIn()) {
    window.location.href = 'login.html';
    return false;
  }

  return true;
}

function authHeaders(extra = {}) {
  const token = getToken();

  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 300) };
  }
}

async function api(method, endpoint, body) {
  const mode = await getAuthMode();

  let res;
  try {
    res = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, data: { error: 'API indisponivel. Verifique se o backend esta rodando.' } };
  }

  const data = await parseJsonSafe(res);

  if (res.status === 401) {
    clearSession();
    if (mode.authEnabled) {
      window.location.href = 'login.html';
    }
    return;
  }

  return { ok: res.ok, status: res.status, data };
}

const Auth = {
  async login(identifier, password) {
    const mode = await getAuthMode();
    if (!mode.authEnabled) {
      setToken('study-mode');
      return { ok: true, data: { token: 'study-mode', mode: 'study' } };
    }

    let res;
    try {
      res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
    } catch {
      return { ok: false, data: { error: 'API indisponivel. Verifique se o backend esta rodando.' } };
    }

    const data = await parseJsonSafe(res);
    if (res.ok && data.token) {
      setToken(data.token);
      return { ok: true, data };
    }
    return { ok: false, data };
  },

  async register(email, username, password) {
    const mode = await getAuthMode();
    if (!mode.authEnabled) {
      return { ok: true, data: { mode: 'study' } };
    }

    let res;
    try {
      res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password }),
      });
    } catch {
      return { ok: false, data: { error: 'API indisponivel. Verifique se o backend esta rodando.' } };
    }

    const data = await parseJsonSafe(res);
    return { ok: res.ok, data };
  },

  logout() {
    const authEnabled = isAuthEnabledCached();
    clearSession();
    if (authEnabled === false) {
      setToken('study-mode');
      window.location.href = 'dashboard.html';
      return;
    }

    window.location.href = 'login.html';
  }
};

const Apps = {
  list: () => api('GET', '/apps'),
  create: (name) => api('POST', '/apps', { name }),
  delete: (id) => api('DELETE', `/apps/${id}`),
  deploy: (id, repositoryUrl, dockerfile) =>
    api('POST', `/apps/${id}/deploy`, {
      repositoryUrl,
      ...(dockerfile ? { dockerfile } : {}),
    }),
  stop: (id) => api('POST', `/apps/${id}/stop`),
};

const Kubernetes = {
  status: (appId) => api('GET', `/kubernetes/${appId}/status`),
  logs: (appId, tail = 200) => api('GET', `/kubernetes/${appId}/logs?tail=${tail}`),
  rollback: (appId) => api('POST', `/kubernetes/${appId}/rollback`),
};

const Deploys = {
  logs: (deployId) => api('GET', `/deploys/${deployId}/logs`),
};

const Envs = {
  list: (appId) => api('GET', `/apps/${appId}/envs`),
  add: (appId, key, value) => api('POST', `/apps/${appId}/envs`, { key, value }),
  delete: (appId, envId) => api('DELETE', `/apps/${appId}/envs/${envId}`),
};

// Helper: retorna ID de app da querystring (?id=...)
function getAppIdFromUrl() {
  return new URLSearchParams(window.location.search).get('id');
}

// Helper: formata data
function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(isoStr));
}

// Helper: badge de status
function statusBadge(status) {
  const map = {
    running:  ['running', 'Running'],
    building: ['building', 'Building'],
    failed:   ['failed', 'Failed'],
    pending:  ['pending', 'Pending'],
  };
  const [cls, label] = map[status] || ['pending', status ?? '—'];
  return `<span class="badge badge-${cls}"><span class="dot"></span>${label}</span>`;
}
