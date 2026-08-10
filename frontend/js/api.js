const API_URL = 'http://localhost:3000';

function getToken() {
  return localStorage.getItem('zploy_token');
}

function setToken(token) {
  localStorage.setItem('zploy_token', token);
}

function clearSession() {
  localStorage.removeItem('zploy_token');
}

function isLoggedIn() {
  return !!getToken();
}

function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/frontend/login.html';
  }
}

function authHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
    ...extra,
  };
}

async function api(method, endpoint, body) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    clearSession();
    window.location.href = '/frontend/login.html';
    return;
  }

  return { ok: res.ok, status: res.status, data };
}

const Auth = {
  async login(email, password) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok && data.token) {
      setToken(data.token);
      return { ok: true, data };
    }
    return { ok: false, data };
  },

  async register(email, password) {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    return { ok: res.ok, data };
  },

  logout() {
    clearSession();
    window.location.href = '/frontend/login.html';
  }
};

const Apps = {
  list: () => api('GET', '/apps'),
  create: (name) => api('POST', '/apps', { name }),
  delete: (id) => api('DELETE', `/apps/${id}`),
  deploy: (id, repositoryUrl) => api('POST', `/apps/${id}/deploy`, { repositoryUrl }),
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
    running:  ['running', '● Running'],
    building: ['building', '⟳ Building'],
    failed:   ['failed', '✕ Failed'],
    pending:  ['pending', '○ Pending'],
  };
  const [cls, label] = map[status] || ['pending', status ?? '—'];
  return `<span class="badge badge-${cls}"><span class="dot"></span>${label}</span>`;
}
