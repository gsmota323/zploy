async function bootstrap() {
  const allowed = await requireAuth();

  if (!allowed) {
    return;
  }

  loadApps();
}

async function loadApps() {
  const grid = document.getElementById('apps-grid');

  const result = await Apps.list();

  const ok = result?.ok;
  const data = result?.data;

  const debugMode =
    new URLSearchParams(window.location.search).get('debug') === '1';

  const apps = Array.isArray(data)
    ? data
    : [];

  if (!ok && apps.length === 0) {
    const details = data?.error
      ? escHtml(data.error)
      : '';

    const subtitle = details
      ? 'Não foi possível carregar seus apps agora.'
      : 'Você ainda não criou nenhum app.';

    grid.innerHTML = `
      <div class="empty-state">

        <p class="empty-title">
          Nenhum app para exibir agora
        </p>

        <p
          style="
            color:var(--text-muted);
            font-size:0.9rem;
            margin-top:6px;
          "
        >
          ${subtitle}
        </p>

        ${
          debugMode && details
            ? `
              <p
                style="
                  color:var(--text-muted);
                  font-size:0.82rem;
                  margin-top:6px;
                "
              >
                Detalhe: ${details}
              </p>
            `
            : ''
        }

        <div
          style="
            margin-top:14px;
            display:flex;
            gap:8px;
            justify-content:center;
            flex-wrap:wrap;
          "
        >

          <button
            class="btn btn-secondary"
            id="btn-retry-apps"
            type="button"
          >
            Tentar novamente
          </button>

          <button
            class="btn btn-primary"
            id="btn-create-empty"
            type="button"
          >
            Criar App
          </button>

        </div>

      </div>
    `;

    return;
  }

  let html = '';

  if (apps.length === 0) {

    html = `
      <div
        class="add-app-card"
        id="btn-add-app-empty"
        role="button"
        tabindex="0"
      >

        <div class="add-icon">
          +
        </div>

        <div
          style="
            font-weight:600;
            font-size:0.95rem;
          "
        >
          Nenhum app criado
        </div>

        <div
          style="
            font-size:0.85rem;
          "
        >
          Clique para criar seu primeiro app
        </div>

      </div>
    `;

  } else {

    html = apps.map(app => {

      const initials =
        app.name
          .slice(0, 2)
          .toUpperCase();

      const displayUrl =
        resolveDashboardAppUrl(app.url || '');

      return `
        <a
          href="app.html?id=${app.id}"
          class="app-card fade-in-up"
        >

          <div class="app-card-top">

            <div class="flex items-center gap-12">

              <div class="app-icon">
                ${initials}
              </div>

              <div>

                <div class="app-card-name">
                  ${escHtml(app.name)}
                </div>

                <div class="app-card-url">
                  ${escHtml(displayUrl)}
                </div>

              </div>

            </div>

            ${statusBadge(app.status)}

          </div>

          <div class="app-card-footer">

            <span>
              Criado em ${formatDate(app.createdAt)}
            </span>

            <span
              style="
                color:var(--primary);
                font-weight:600;
              "
            >
              Ver →
            </span>

          </div>

        </a>
      `;

    }).join('') + `

      <div
        class="add-app-card"
        id="btn-add-app"
        role="button"
        tabindex="0"
      >

        <div class="add-icon">
          +
        </div>

        <div
          style="
            font-weight:600;
            font-size:0.95rem;
          "
        >
          Novo App
        </div>

      </div>
    `;
  }

  grid.innerHTML = html;
}

function escHtml(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function resolveDashboardAppUrl(rawUrl) {
  if (!rawUrl) {
    return '';
  }

  try {

    const parsed = new URL(rawUrl);

    if (
      !parsed.hostname.endsWith('.localtest.me') ||
      parsed.port
    ) {
      return rawUrl;
    }

    const rememberedPort =
      window.localStorage.getItem(
        'zployExposePort'
      ) || '8080';

    parsed.port = rememberedPort;

    return parsed
      .toString()
      .replace(/\/$/, '');

  } catch {

    return rawUrl;
  }
}

function openModal() {
  const overlay =
    document.getElementById('modal-overlay');

  const input =
    document.getElementById('app-name');

  overlay.classList.add('active');

  input.focus();
}

function closeModal() {
  const overlay =
    document.getElementById('modal-overlay');

  const error =
    document.getElementById('create-error');

  const input =
    document.getElementById('app-name');

  const btn =
    document.getElementById('btn-create');

  overlay.classList.remove('active');

  error.classList.remove('visible');

  error.textContent = '';

  input.value = '';

  btn.innerHTML = 'Criar App';

  btn.disabled = false;
}

function closeModalOnOverlay(event) {
  if (
    event.target ===
    document.getElementById('modal-overlay')
  ) {
    closeModal();
  }
}

async function createApp() {
  const input =
    document.getElementById('app-name');

  const btn =
    document.getElementById('btn-create');

  const errEl =
    document.getElementById('create-error');

  const name =
    input.value.trim();

  if (!name) {

    errEl.textContent =
      'Informe o nome do App.';

    errEl.classList.add('visible');

    input.focus();

    return;
  }

  btn.innerHTML =
    '<span class="loading"></span> Criando...';

  btn.disabled = true;

  errEl.classList.remove('visible');

  const result =
    await Apps.create(name);

  const ok = result?.ok;
  const data = result?.data;

  if (ok && data?.id) {

    closeModal();

    window.location.href =
      `app.html?id=${data.id}`;

    return;
  }

  errEl.textContent =
    data?.error ||
    'Erro ao criar app.';

  errEl.classList.add('visible');

  btn.innerHTML =
    'Criar App';

  btn.disabled = false;
}

/* ============================================================
 * EVENTOS
 * ============================================================ */

document.addEventListener('click', event => {

  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  /* Novo App — botão principal */

  if (target.closest('#btn-new-app')) {
    openModal();
    return;
  }

  /* Sair */

  if (target.closest('#btn-logout')) {
    Auth.logout();
    return;
  }

  /* Cancelar modal */

  if (target.closest('#btn-cancel-create')) {
    closeModal();
    return;
  }

  /* Criar App */

  if (target.closest('#btn-create')) {
    createApp();
    return;
  }

  /* Tentar carregar os apps novamente */

  if (target.closest('#btn-retry-apps')) {
    loadApps();
    return;
  }

  /* Criar App quando não existem apps */

  if (target.closest('#btn-create-empty')) {
    openModal();
    return;
  }

  /* Card "Nenhum app criado" */

  if (target.closest('#btn-add-app-empty')) {
    openModal();
    return;
  }

  /* Card "Novo App" */

  if (target.closest('#btn-add-app')) {
    openModal();
    return;
  }

  /* Fechar modal clicando fora */

  if (target.id === 'modal-overlay') {
    closeModalOnOverlay(event);
  }
});

/* Enter / Escape no campo de nome */

document
  .getElementById('app-name')
  .addEventListener('keydown', event => {

    if (event.key === 'Enter') {
      event.preventDefault();
      createApp();
    }

    if (event.key === 'Escape') {
      closeModal();
    }
  });

/* Inicialização */

bootstrap();