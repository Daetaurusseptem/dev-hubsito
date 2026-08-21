const state = { pin: localStorage.getItem('devHubPin') || '', projects: [], timer: null, discovery: null, browserPath: null, browserScope: 'allowed', settings: null, settingsDraft: null, editingProject: null, pendingProjectIcon: null, pendingIconMode: 'favicon', previewObjectUrl: null, waifuFrame: null, pendingWaifuSprite: null, waifuPreviewObjectUrl: null };
const THEME_PRESETS = {
  aurora: { name: 'Aurora', accent: '#7c3aed', background: '#080b14', surface: '#111725', text: '#e8ecf7', radius: 20, density: 'comfortable', glass: 14, glow: 22, pattern: 'aurora' },
  midnight: { name: 'Midnight', accent: '#38bdf8', background: '#030712', surface: '#0b1220', text: '#e5f2ff', radius: 12, density: 'compact', glass: 8, glow: 12, pattern: 'grid' },
  matcha: { name: 'Matcha', accent: '#65a30d', background: '#10140d', surface: '#1a2115', text: '#edf5e7', radius: 24, density: 'spacious', glass: 18, glow: 18, pattern: 'aurora' },
  ember: { name: 'Ember', accent: '#f97316', background: '#160b08', surface: '#25130f', text: '#fff1e8', radius: 8, density: 'comfortable', glass: 4, glow: 28, pattern: 'none' },
};
const ICON_LIBRARY = {
  angular: { glyph: 'A', label: 'Angular', kind: 'angular' }, react: { glyph: '⚛', label: 'React', kind: 'react' },
  vue: { glyph: 'V', label: 'Vue', kind: 'vue' }, node: { glyph: '⬢', label: 'Node', kind: 'node' },
  docker: { glyph: '◆', label: 'Docker', kind: 'docker' }, bun: { glyph: 'B', label: 'Bun', kind: 'bun' },
  express: { glyph: 'EX', label: 'Express', kind: 'node' }, postgres: { glyph: 'PG', label: 'PostgreSQL', kind: 'database' },
  database: { glyph: 'DB', label: 'Base de datos', kind: 'database' }, code: { glyph: '</>', label: 'Código', kind: 'code' },
};
const $ = (selector) => document.querySelector(selector);
const IS_TAURI = Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
const API_ROOT = IS_TAURI ? 'http://127.0.0.1:4173/api' : '/api';
const projectsEl = $('#projects');
const toastEl = $('#toast');

function escapeHtml(value = '') { const el = document.createElement('div'); el.textContent = value; return el.innerHTML; }
function initials(name) { return name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase(); }
function technologyIcon(service) {
  const haystack = JSON.stringify(service).toLowerCase();
  if (haystack.includes('postgres')) return ICON_LIBRARY.postgres;
  if (/mysql|mongo|redis/.test(haystack)) return ICON_LIBRARY.database;
  if (haystack.includes('angular')) return ICON_LIBRARY.angular;
  if (haystack.includes('react') || haystack.includes('next.js')) return ICON_LIBRARY.react;
  if (haystack.includes('vue') || haystack.includes('nuxt')) return ICON_LIBRARY.vue;
  if (haystack.includes('docker')) return ICON_LIBRARY.docker;
  if (haystack.includes('express')) return ICON_LIBRARY.express;
  if (/node|nestjs/.test(haystack)) return ICON_LIBRARY.node;
  if (haystack.includes('bun')) return ICON_LIBRARY.bun;
  return ICON_LIBRARY.code;
}
function projectImage(project) {
  if (project.iconMode === 'custom' && project.icon) return project.icon;
  const candidates = project.services.filter(service => service.url && service.openable !== false);
  const preferred = candidates.find(service => /angular|react|vue|vite|next|nuxt|web|frontend/i.test(`${service.framework || ''} ${service.name}`)) || candidates[0];
  if (!preferred?.url) return '';
  try { return new URL('/favicon.ico', preferred.url).href; } catch { return ''; }
}
function technologyMarkup(service) {
  const tech = technologyIcon(service);
  return `<span class="technology-icon ${tech.kind}" title="${escapeHtml(tech.label)}">${escapeHtml(tech.glyph)}</span>`;
}
function applyTheme(settings) {
  if (!settings) return;
  const root = document.documentElement;
  root.style.setProperty('--theme-accent', settings.accent); root.style.setProperty('--theme-bg', settings.background);
  root.style.setProperty('--theme-surface', settings.surface); root.style.setProperty('--theme-text', settings.text);
  root.style.setProperty('--theme-radius', `${settings.radius}px`); root.style.setProperty('--theme-glass', `${settings.glass}px`);
  root.style.setProperty('--theme-glow', String(settings.glow / 100));
  document.body.dataset.density = settings.density; document.body.dataset.pattern = settings.pattern;
}
function spriteUrl(source = '') {
  if (IS_TAURI && source.startsWith('/uploads/')) return `http://127.0.0.1:4173${source}`;
  return source;
}
function frameCoordinates(frame, columns, rows) {
  const safeColumns = Math.max(1, Number(columns) || 1); const safeRows = Math.max(1, Number(rows) || 1);
  const safeFrame = Math.min(safeColumns * safeRows - 1, Math.max(0, Number(frame) || 0));
  const column = safeFrame % safeColumns; const row = Math.floor(safeFrame / safeColumns);
  return { x: safeColumns === 1 ? 0 : column / (safeColumns - 1) * 100, y: safeRows === 1 ? 0 : row / (safeRows - 1) * 100 };
}
function waifuMessage() {
  const services = state.projects.flatMap(project => project.services); const running = services.filter(service => service.running).length;
  if (!services.length) return 'Agreguemos nuestro primer proyecto.';
  if (!running) return 'Todo está en pausa. Cuando quieras arrancamos.';
  if (running === services.length) return `Los ${running} servicios están respondiendo.`;
  return `${running} de ${services.length} servicios están activos.`;
}
function renderWaifu(settings = state.settings) {
  const rail = $('#waifuRail'); const waifu = settings?.waifu;
  if (!waifu?.enabled) { rail.hidden = true; document.body.classList.remove('waifu-enabled'); return; }
  rail.hidden = false; document.body.classList.add('waifu-enabled');
  const total = Math.max(1, waifu.columns * waifu.rows);
  if (state.waifuFrame === null || state.waifuFrame >= total) state.waifuFrame = Math.min(waifu.frame, total - 1);
  const position = frameCoordinates(state.waifuFrame, waifu.columns, waifu.rows);
  rail.style.setProperty('--waifu-sprite', `url("${spriteUrl(waifu.sprite)}")`);
  rail.style.setProperty('--waifu-bg-width', `${waifu.columns * 100}%`); rail.style.setProperty('--waifu-bg-height', `${waifu.rows * 100}%`);
  rail.style.setProperty('--waifu-frame-x', `${position.x}%`); rail.style.setProperty('--waifu-frame-y', `${position.y}%`);
  rail.style.setProperty('--waifu-scale', String(waifu.scale / 100));
  $('#waifuName').textContent = waifu.name; $('#waifuSpeech').textContent = waifuMessage();
}
function renderWaifuSettingsPreview() {
  const waifu = state.settingsDraft?.waifu; if (!waifu) return;
  const preview = $('#waifuSettingsPreview'); const position = frameCoordinates(waifu.frame, waifu.columns, waifu.rows);
  preview.style.setProperty('--preview-sprite', `url("${spriteUrl(waifu.sprite)}")`);
  preview.style.setProperty('--preview-bg-width', `${waifu.columns * 100}%`); preview.style.setProperty('--preview-bg-height', `${waifu.rows * 100}%`);
  preview.style.setProperty('--preview-x', `${position.x}%`); preview.style.setProperty('--preview-y', `${position.y}%`);
  preview.style.setProperty('--preview-scale', String(waifu.scale / 100));
}
function statusLabel(service) { return service.ownership === 'managed' ? 'ACTIVO' : service.ownership === 'external' ? 'EXTERNO' : 'DETENIDO'; }
function api(path, options = {}) {
  const headers = { authorization: `Bearer ${state.pin}`, ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['content-type'] = 'application/json';
  return fetch(`${API_ROOT}${path}`, { ...options, headers })
    .then(async response => { const body = await response.json().catch(() => ({})); if (!response.ok) throw Object.assign(new Error(body.message || 'Error'), { status: response.status }); return body; });
}
function toast(message) { toastEl.textContent = message; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 2400); }
function setBusy(button, busy) { if (!button) return; button.disabled = busy; button.dataset.label ||= button.textContent; button.textContent = busy ? '…' : button.dataset.label; }

function render() {
  const running = state.projects.flatMap(p => p.services).filter(s => s.running).length;
  $('#runningCount').textContent = `${running} servicio${running === 1 ? '' : 's'} activo${running === 1 ? '' : 's'}`;
  $('#projectCount').textContent = `${state.projects.length} proyecto${state.projects.length === 1 ? '' : 's'} registrado${state.projects.length === 1 ? '' : 's'}`;
  renderWaifu();
  if (!state.projects.length) { projectsEl.innerHTML = '<div class="empty">Agrega tu primer proyecto para comenzar.</div>'; return; }
  projectsEl.innerHTML = state.projects.map(project => {
    const allRunning = project.services.length > 0 && project.services.every(service => service.running);
    const image = projectImage(project);
    return `
    <article class="project-card" style="--accent:${escapeHtml(project.color || '#7c3aed')}">
      <header class="project-header"><div class="project-title"><span class="project-icon"><span>${initials(project.name)}</span>${image ? `<img data-project-image src="${escapeHtml(image)}" alt="">` : ''}</span><div><h3>${escapeHtml(project.name)}</h3><p>${escapeHtml(project.description || 'Proyecto local')}</p></div></div>
      <div class="project-actions"><button class="ghost" data-project-action="${allRunning ? 'stop' : 'start'}" data-project="${project.id}">${allRunning ? '■ Detener' : '▶ Iniciar'} todo</button><button class="ghost" data-project-settings="${project.id}" title="Configurar proyecto">•••</button></div></header>
      <div class="services">${project.services.map(service => `
        <div class="service"><div class="service-head"><div><div class="service-meta"><i class="dot ${service.ownership === 'managed' ? 'online' : service.ownership === 'external' ? 'external' : 'offline'}"></i>${technologyMarkup(service)}<strong>${escapeHtml(service.name)}</strong><span class="status-pill ${service.ownership}">${statusLabel(service)}</span></div><span class="port">${escapeHtml(service.framework || service.kind)} · :${service.port}${service.ownership === 'external' ? ' · fuera del Hub' : ''}</span></div>
        <div class="service-actions">${service.url && service.running ? `<a class="open-link" href="${service.url}" target="_blank" rel="noreferrer">Abrir ↗</a>` : ''}
        ${service.ownership === 'managed' ? `<button class="service-button" data-logs="${service.id}" data-name="${escapeHtml(service.name)}">Logs</button><button class="service-button stop" data-service-action="stop" data-service="${service.id}">Detener</button><button class="service-button" data-service-action="restart" data-service="${service.id}">Reiniciar</button>` : service.ownership === 'external' && service.kind === 'docker-compose' ? `<button class="service-button stop" data-service-action="stop" data-service="${service.id}">Detener</button><button class="service-button" data-service-action="restart" data-service="${service.id}">Reiniciar</button>` : service.ownership === 'external' ? `<button class="service-button" disabled title="Iniciado fuera del Hub">No administrado</button>` : `<button class="service-button start" data-service-action="start" data-service="${service.id}">Iniciar</button>`}</div></div></div>`).join('')}</div>
    </article>`;
  }).join('');
  document.querySelectorAll('[data-project-image]').forEach(image => image.addEventListener('error', () => image.remove()));
}

async function load({ quiet = false } = {}) {
  try { const data = await api('/projects'); state.projects = data.projects; state.settings = data.settings; applyTheme(state.settings); $('#networkLabel').textContent = `${data.host}:${new URL(API_ROOT, location.href).port || location.port || 4173}`; render(); }
  catch (error) { if (error.status === 401) { clearInterval(state.timer); $('#authDialog').showModal(); } else if (!quiet) toast(error.message); }
}
async function action(path, button) { setBusy(button, true); try { const result = await api(path, { method: 'POST' }); toast(result.message); await new Promise(r => setTimeout(r, 700)); await load(); } catch (error) { toast(error.message); } finally { setBusy(button, false); } }

function repositoryLabel(mode) { return mode === 'multi-repo' ? 'VARIOS REPOS' : mode === 'monorepo' ? 'MONOREPO' : 'REPO ÚNICO'; }
function defaultArgs(pkg) { return [...pkg.hostArgs, ...(pkg.hostArgs.length ? ['--port', String(pkg.suggestedPort)] : [])].join(' '); }
function renderDiscovery(discovery) {
  state.discovery = discovery;
  $('#discoveryPlaceholder').hidden = true;
  $('#discoveryResult').hidden = false;
  $('#saveProjectButton').disabled = false;
  $('#repoMode').textContent = repositoryLabel(discovery.repositoryMode);
  $('#detectedTitle').textContent = discovery.name;
  $('#detectedMeta').textContent = `${discovery.packages.length} paquete${discovery.packages.length === 1 ? '' : 's'} · ${discovery.gitRootCount} raíz${discovery.gitRootCount === 1 ? '' : 'es'} Git`;
  $('#projectName').value = discovery.name;
  $('#detectedServices').innerHTML = discovery.packages.map((pkg, index) => `
    <article class="detected-service" data-index="${index}" data-relative="${escapeHtml(pkg.relativePath)}" data-framework="${escapeHtml(pkg.framework)}" data-kind="${escapeHtml(pkg.kind)}">
      <header><label class="service-toggle"><input class="include-service" type="checkbox" checked><span></span></label><div><strong>${escapeHtml(pkg.name)}</strong><small>${escapeHtml(pkg.relativePath)}</small></div><span class="framework-badge">${escapeHtml(pkg.framework)}</span></header>
      <div class="service-config-grid">
        <label>Nombre<input class="detected-name" value="${escapeHtml(pkg.kind === 'frontend' ? 'Web' : pkg.kind === 'backend' ? 'API' : pkg.name)}" required></label>
        <label>Comando<select class="detected-script">${pkg.scripts.map(script => `<option value="${escapeHtml(script)}" ${script === pkg.suggestedScript ? 'selected' : ''}>bun run ${escapeHtml(script)}</option>`).join('')}</select></label>
        <label>Puerto<input class="detected-port" type="number" min="1024" max="65535" value="${pkg.suggestedPort}" required></label>
        <label>Acceso<span class="inline-check"><input class="detected-openable" type="checkbox" checked> Mostrar botón Abrir</span></label>
        <label class="wide-field">Argumentos<input class="detected-args" value="${escapeHtml(defaultArgs(pkg))}" placeholder="--host 0.0.0.0 --port ${pkg.suggestedPort}"></label>
      </div>
      <code class="command-preview">bun run ${escapeHtml(pkg.suggestedScript)} ${escapeHtml(defaultArgs(pkg))}</code>
    </article>`).join('');
}

function updateCommandPreview(card) {
  const script = card.querySelector('.detected-script').value;
  const argsInput = card.querySelector('.detected-args');
  const selectedPort = card.querySelector('.detected-port').value;
  if (/--port\s+\d+/.test(argsInput.value)) argsInput.value = argsInput.value.replace(/--port\s+\d+/, `--port ${selectedPort}`);
  const args = argsInput.value;
  card.querySelector('.command-preview').textContent = `bun run ${script}${args ? ` ${args}` : ''}`;
  card.classList.toggle('excluded', !card.querySelector('.include-service').checked);
}

async function detectFolder(button) {
  const folder = $('#folderInput').value.trim();
  if (!folder) { $('#addError').textContent = 'Escribe una carpeta'; return; }
  setBusy(button, true); $('#addError').textContent = '';
  try { renderDiscovery(await api('/discovery', { method: 'POST', body: JSON.stringify({ folder }) })); }
  catch (error) { state.discovery = null; $('#discoveryResult').hidden = true; $('#discoveryPlaceholder').hidden = false; $('#saveProjectButton').disabled = true; $('#addError').textContent = error.message; }
  finally { setBusy(button, false); }
}

async function openDirectory(folder = '', scope = state.browserScope) {
  const list = $('#folderList');
  state.browserScope = scope;
  $('#folderScopeLabel').textContent = scope === 'system' ? 'Este equipo · elige una carpeta para autorizarla' : 'Ubicaciones autorizadas';
  $('#systemBrowseButton').hidden = scope === 'system';
  $('#selectFolderButton').textContent = scope === 'system' ? 'Agregar esta ubicación' : 'Usar esta carpeta';
  $('#folderError').textContent = '';
  list.innerHTML = '<div class="folder-loading">Leyendo carpetas…</div>';
  try {
    const params = new URLSearchParams();
    if (folder) params.set('path', folder);
    if (scope === 'system') params.set('scope', 'system');
    const query = params.size ? `?${params}` : '';
    const data = await api(`/filesystem${query}`);
    state.browserPath = data.current;
    $('#selectFolderButton').disabled = !data.current;
    $('#folderBreadcrumbs').innerHTML = data.mode === 'roots'
      ? `<span>${scope === 'system' ? 'Unidades del equipo' : 'Raíces permitidas'}</span>`
      : `${data.parent ? '<button type="button" data-folder-root>Raíces</button><i>›</i>' : ''}${data.breadcrumbs.map((crumb, index) => `${index ? '<i>›</i>' : ''}<button type="button" data-folder-path="${escapeHtml(crumb.path)}">${escapeHtml(crumb.name)}</button>`).join('')}`;
    const parentEntry = data.parent
      ? `<button type="button" class="folder-entry" data-folder-path="${escapeHtml(data.parent)}"><span class="folder-icon">↰</span><span>Subir un nivel</span><i>›</i></button>`
      : '';
    const directories = data.entries.map(entry => `<button type="button" class="folder-entry" data-folder-path="${escapeHtml(entry.path)}"><span class="folder-icon">▰</span><span>${escapeHtml(entry.name)}</span><i>›</i></button>`).join('');
    list.innerHTML = parentEntry || directories ? `${parentEntry}${directories}` : '<div class="folder-empty">Esta carpeta no contiene subcarpetas.</div>';
  } catch (error) {
    state.browserPath = null;
    $('#selectFolderButton').disabled = true;
    list.innerHTML = '<div class="folder-empty">No se pudo abrir la carpeta.</div>';
    $('#folderError').textContent = error.message;
  }
}

function settingsFromControls() {
  return {
    ...state.settingsDraft,
    preset: 'custom', accent: $('#themeAccent').value, background: $('#themeBackground').value,
    surface: $('#themeSurface').value, text: $('#themeText').value, radius: Number($('#themeRadius').value),
    glass: Number($('#themeGlass').value), glow: Number($('#themeGlow').value),
    density: $('#themeDensity').value, pattern: $('#themePattern').value,
    waifu: {
      ...state.settingsDraft.waifu,
      enabled: $('#waifuEnabled').checked,
      name: $('#waifuCustomName').value.trim() || 'Waifu',
      columns: Number($('#waifuColumns').value), rows: Number($('#waifuRows').value),
      scale: Number($('#waifuScale').value),
    },
  };
}

function renderSettingsControls() {
  const settings = state.settingsDraft;
  $('#themePresets').innerHTML = Object.entries(THEME_PRESETS).map(([key, preset]) => `<button type="button" class="theme-preset ${settings.preset === key ? 'active' : ''}" data-theme-preset="${key}" style="--preview-bg:${preset.background};--preview-accent:${preset.accent};--preview-text:${preset.text}"><span></span><strong>${preset.name}</strong></button>`).join('');
  $('#themeAccent').value = settings.accent; $('#themeBackground').value = settings.background;
  $('#themeSurface').value = settings.surface; $('#themeText').value = settings.text;
  $('#themeRadius').value = settings.radius; $('#themeGlass').value = settings.glass; $('#themeGlow').value = settings.glow;
  $('#themeDensity').value = settings.density; $('#themePattern').value = settings.pattern;
  $('#radiusValue').textContent = `${settings.radius}px`; $('#glassValue').textContent = `${settings.glass}px`; $('#glowValue').textContent = `${settings.glow}%`;
  $('#waifuEnabled').checked = settings.waifu.enabled; $('#waifuCustomName').value = settings.waifu.name;
  $('#waifuColumns').value = settings.waifu.columns; $('#waifuRows').value = settings.waifu.rows; $('#waifuScale').value = settings.waifu.scale;
  $('#waifuScaleValue').textContent = `${settings.waifu.scale}%`; renderWaifuSettingsPreview();
}

function openSettings() {
  state.settingsDraft = structuredClone(state.settings);
  state.pendingWaifuSprite = null;
  if (state.waifuPreviewObjectUrl) URL.revokeObjectURL(state.waifuPreviewObjectUrl);
  state.waifuPreviewObjectUrl = null;
  renderSettingsControls();
  $('#settingsError').textContent = '';
  $('#settingsDialog').showModal();
  updateAutostartControl();
}

async function updateAutostartControl() {
  const toggle = $('#autostartToggle'); const status = $('#autostartStatus');
  const autostart = window.__TAURI__?.autostart;
  if (!autostart) { toggle.disabled = true; status.textContent = 'Disponible dentro de la app de escritorio'; return; }
  try { toggle.checked = await autostart.isEnabled(); toggle.disabled = false; status.textContent = toggle.checked ? 'DevHubsito arrancará al iniciar sesión' : 'Desactivado'; }
  catch { toggle.disabled = true; status.textContent = 'No se pudo consultar Windows'; }
}

function closeSettings() {
  applyTheme(state.settings);
  renderWaifu(state.settings);
  if (state.waifuPreviewObjectUrl) URL.revokeObjectURL(state.waifuPreviewObjectUrl);
  state.waifuPreviewObjectUrl = null; state.pendingWaifuSprite = null;
  state.settingsDraft = null;
  $('#settingsDialog').close();
}

function setProjectIconPreview(source, project) {
  const preview = $('#projectIconPreview');
  preview.style.setProperty('--project-accent', project.color || '#7c3aed');
  preview.innerHTML = `<span>${initials(project.name)}</span>${source ? `<img src="${escapeHtml(source)}" alt="">` : ''}`;
  preview.querySelector('img')?.addEventListener('error', event => event.currentTarget.remove());
}

function openProjectSettings(projectId) {
  const project = state.projects.find(item => item.id === projectId); if (!project) return;
  if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
  state.editingProject = project; state.pendingProjectIcon = null; state.previewObjectUrl = null;
  state.pendingIconMode = project.iconMode === 'custom' ? 'custom' : 'favicon';
  $('#projectSettingsTitle').textContent = project.name; $('#projectSettingsName').value = project.name;
  $('#projectSettingsDescription').value = project.description || ''; $('#projectSettingsColor').value = project.color || '#2563eb';
  $('#projectIconFile').value = ''; $('#projectSettingsError').textContent = '';
  setProjectIconPreview(projectImage(project), project); $('#projectSettingsDialog').showModal();
}

function closeProjectSettings() {
  if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
  state.previewObjectUrl = null; state.editingProject = null; state.pendingProjectIcon = null;
  $('#projectSettingsDialog').close();
}

document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.id === 'addButton') $('#addDialog').showModal();
  if (button.id === 'settingsButton') openSettings();
  if (button.id === 'waifuSettingsButton') openSettings();
  if (button.id === 'waifuCharacter' && state.settings?.waifu) {
    state.waifuFrame = (state.waifuFrame + 1) % (state.settings.waifu.columns * state.settings.waifu.rows);
    renderWaifu();
  }
  if (button.dataset.projectSettings) openProjectSettings(button.dataset.projectSettings);
  if (button.dataset.themePreset) {
    state.settingsDraft = { ...state.settingsDraft, ...THEME_PRESETS[button.dataset.themePreset], preset: button.dataset.themePreset };
    renderSettingsControls(); applyTheme(state.settingsDraft);
  }
  if (button.id === 'browseButton') { state.browserScope = 'allowed'; $('#folderDialog').showModal(); openDirectory('', 'allowed'); }
  if (button.id === 'systemBrowseButton') openDirectory('', 'system');
  if (button.dataset.folderRoot !== undefined) openDirectory('', state.browserScope);
  if (button.dataset.folderPath) openDirectory(button.dataset.folderPath);
  if (button.id === 'selectFolderButton' && state.browserPath) {
    if (state.browserScope === 'system') {
      try { await api('/roots', { method: 'POST', body: JSON.stringify({ path: state.browserPath }) }); }
      catch (error) { $('#folderError').textContent = error.message; return; }
    }
    $('#folderInput').value = state.browserPath;
    $('#folderDialog').close();
    detectFolder($('#detectButton'));
  }
  if (button.id === 'detectButton') detectFolder(button);
  if (button.id === 'refreshButton') load();
  if (button.dataset.close === 'settingsDialog') closeSettings();
  else if (button.dataset.close === 'projectSettingsDialog') closeProjectSettings();
  else if (button.dataset.close) $(`#${button.dataset.close}`).close();
  if (button.dataset.serviceAction) action(`/services/${button.dataset.service}/${button.dataset.serviceAction}`, button);
  if (button.dataset.projectAction) action(`/projects/${button.dataset.project}/${button.dataset.projectAction}`, button);
  if (button.dataset.logs) { const result = await api(`/services/${button.dataset.logs}/logs`); $('#logsTitle').textContent = button.dataset.name; $('#logsOutput').textContent = result.logs.join('\n') || 'Sin logs disponibles. Los procesos iniciados fuera del Hub no exponen su salida.'; $('#logsDialog').showModal(); }
  if (button.id === 'useFaviconButton' && state.editingProject) { state.pendingProjectIcon = null; state.pendingIconMode = 'favicon'; $('#projectIconFile').value = ''; setProjectIconPreview(projectImage({ ...state.editingProject, iconMode: 'favicon' }), state.editingProject); }
  if (button.id === 'resetWaifuButton' && state.settingsDraft?.waifu) {
    state.pendingWaifuSprite = null; $('#waifuSpriteFile').value = '';
    if (state.waifuPreviewObjectUrl) URL.revokeObjectURL(state.waifuPreviewObjectUrl);
    state.waifuPreviewObjectUrl = null;
    state.settingsDraft.waifu = { ...state.settingsDraft.waifu, sprite: '/waifu-default.png', columns: 4, rows: 4, frame: 2 };
    renderSettingsControls();
  }
  if (button.id === 'removeProjectButton' && state.editingProject) { if (!confirm(`Quitar ${state.editingProject.name} del Hub? Sus archivos no se borrarán.`)) return; try { const result = await api(`/projects/${state.editingProject.id}`, { method: 'DELETE' }); closeProjectSettings(); toast(result.message); load(); } catch (error) { $('#projectSettingsError').textContent = error.message; } }
});

$('#settingsForm').addEventListener('input', event => {
  if (!state.settingsDraft || event.target.closest('.desktop-settings')) return;
  state.settingsDraft = settingsFromControls();
  $('#radiusValue').textContent = `${state.settingsDraft.radius}px`; $('#glassValue').textContent = `${state.settingsDraft.glass}px`; $('#glowValue').textContent = `${state.settingsDraft.glow}%`;
  applyTheme(state.settingsDraft); renderWaifuSettingsPreview();
  document.querySelectorAll('.theme-preset').forEach(button => button.classList.remove('active'));
});
$('#settingsForm').addEventListener('submit', async event => {
  event.preventDefault(); $('#settingsError').textContent = '';
  try {
    if (state.pendingWaifuSprite) {
      const upload = new FormData(); upload.append('sprite', state.pendingWaifuSprite);
      const uploadedSettings = await api('/waifu/sprite', { method: 'POST', body: upload });
      state.settingsDraft.waifu.sprite = uploadedSettings.waifu.sprite;
    }
    state.settings = await api('/settings', { method: 'PUT', body: JSON.stringify(state.settingsDraft) });
    applyTheme(state.settings); renderWaifu(state.settings);
    if (state.waifuPreviewObjectUrl) URL.revokeObjectURL(state.waifuPreviewObjectUrl);
    state.waifuPreviewObjectUrl = null; state.pendingWaifuSprite = null; state.settingsDraft = null; $('#settingsDialog').close(); render(); toast('Apariencia guardada');
  } catch (error) { $('#settingsError').textContent = error.message; }
});
$('#autostartToggle').addEventListener('change', async event => {
  const toggle = event.currentTarget; const status = $('#autostartStatus'); const autostart = window.__TAURI__?.autostart;
  if (!autostart) return;
  toggle.disabled = true; status.textContent = 'Actualizando Windows…';
  try { if (toggle.checked) await autostart.enable(); else await autostart.disable(); status.textContent = toggle.checked ? 'DevHubsito arrancará al iniciar sesión' : 'Desactivado'; }
  catch (error) { toggle.checked = !toggle.checked; status.textContent = error?.message || 'No se pudo cambiar el inicio automático'; }
  finally { toggle.disabled = false; }
});

$('#waifuSpriteFile').addEventListener('change', event => {
  const file = event.target.files?.[0]; if (!file || !state.settingsDraft?.waifu) return;
  if (file.size > 12 * 1024 * 1024) { $('#settingsError').textContent = 'El spritesheet debe pesar máximo 12 MB'; event.target.value = ''; return; }
  if (!['image/png', 'image/webp'].includes(file.type)) { $('#settingsError').textContent = 'Usa un spritesheet PNG o WebP'; event.target.value = ''; return; }
  if (state.waifuPreviewObjectUrl) URL.revokeObjectURL(state.waifuPreviewObjectUrl);
  state.waifuPreviewObjectUrl = URL.createObjectURL(file); state.pendingWaifuSprite = file;
  state.settingsDraft.waifu = { ...state.settingsDraft.waifu, sprite: state.waifuPreviewObjectUrl, frame: 0 };
  $('#settingsError').textContent = ''; renderWaifuSettingsPreview();
});

$('#projectIconFile').addEventListener('change', event => {
  const file = event.target.files?.[0]; if (!file || !state.editingProject) return;
  if (file.size > 2 * 1024 * 1024) { $('#projectSettingsError').textContent = 'La imagen debe pesar máximo 2 MB'; event.target.value = ''; return; }
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'].includes(file.type) && !file.name.toLowerCase().endsWith('.ico')) {
    $('#projectSettingsError').textContent = 'Usa una imagen PNG, JPG, WebP o ICO'; event.target.value = ''; return;
  }
  if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
  state.previewObjectUrl = URL.createObjectURL(file); state.pendingProjectIcon = file; state.pendingIconMode = 'custom';
  $('#projectSettingsError').textContent = ''; setProjectIconPreview(state.previewObjectUrl, state.editingProject);
});

$('#projectSettingsForm').addEventListener('submit', async event => {
  event.preventDefault(); if (!state.editingProject) return;
  const submit = event.currentTarget.querySelector('button[type="submit"]'); setBusy(submit, true); $('#projectSettingsError').textContent = '';
  try {
    if (state.pendingProjectIcon) {
      const upload = new FormData(); upload.append('icon', state.pendingProjectIcon);
      await api(`/projects/${state.editingProject.id}/icon`, { method: 'POST', body: upload });
    }
    await api(`/projects/${state.editingProject.id}`, { method: 'PATCH', body: JSON.stringify({
      name: $('#projectSettingsName').value, description: $('#projectSettingsDescription').value,
      color: $('#projectSettingsColor').value, iconMode: state.pendingIconMode,
    }) });
    closeProjectSettings(); await load(); toast('Proyecto actualizado');
  } catch (error) { $('#projectSettingsError').textContent = error.message; }
  finally { setBusy(submit, false); }
});

$('#detectedServices').addEventListener('input', event => { const card = event.target.closest('.detected-service'); if (card) updateCommandPreview(card); });
$('#detectedServices').addEventListener('change', event => { const card = event.target.closest('.detected-service'); if (card) updateCommandPreview(card); });

$('#authForm').addEventListener('submit', async event => { event.preventDefault(); state.pin = $('#pinInput').value; try { await load(); localStorage.setItem('devHubPin', state.pin); $('#authError').textContent = ''; $('#authDialog').close(); state.timer = setInterval(() => load({ quiet: true }), 4000); } catch (error) { $('#authError').textContent = error.message; } });
$('#onboardingPinRequired').addEventListener('change', event => {
  $('#onboardingPinField').hidden = !event.currentTarget.checked;
  $('#onboardingPin').required = event.currentTarget.checked;
});
$('#onboardingForm').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.currentTarget.querySelector('button[type="submit"]'); setBusy(submit, true); $('#onboardingError').textContent = '';
  const pinRequired = $('#onboardingPinRequired').checked; const pin = $('#onboardingPin').value;
  try {
    await api('/onboarding', { method: 'POST', body: JSON.stringify({ pinRequired, pin, waifuEnabled: $('#onboardingWaifuEnabled').checked }) });
    state.pin = pinRequired ? pin : ''; if (pinRequired) localStorage.setItem('devHubPin', pin); else localStorage.removeItem('devHubPin');
    $('#onboardingDialog').close(); await load(); state.timer = setInterval(() => load({ quiet: true }), 4000); toast('Tu hubsito está listo');
  } catch (error) { $('#onboardingError').textContent = error.message; }
  finally { setBusy(submit, false); }
});
$('#addForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!state.discovery) return;
  const form = new FormData(event.currentTarget);
  const input = Object.fromEntries(form);
  input.services = [...document.querySelectorAll('.detected-service')]
    .filter(card => card.querySelector('.include-service').checked)
    .map(card => ({
      relativePath: card.dataset.relative,
      framework: card.dataset.framework,
      kind: card.dataset.kind,
      name: card.querySelector('.detected-name').value,
      script: card.querySelector('.detected-script').value,
      port: Number(card.querySelector('.detected-port').value),
      openable: card.querySelector('.detected-openable').checked,
      args: card.querySelector('.detected-args').value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(x => x.replace(/^"|"$/g, '')) || [],
    }));
  $('#addError').textContent = '';
  try {
    await api('/projects', { method: 'POST', body: JSON.stringify(input) });
    event.currentTarget.reset(); state.discovery = null; $('#discoveryResult').hidden = true; $('#discoveryPlaceholder').hidden = false; $('#saveProjectButton').disabled = true;
    $('#addDialog').close(); toast('Proyecto agregado'); load();
  } catch (error) { $('#addError').textContent = error.message; }
});
document.querySelectorAll('dialog:not([data-static])').forEach(dialog => {
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.id === 'settingsDialog' ? closeSettings() : dialog.id === 'projectSettingsDialog' ? closeProjectSettings() : dialog.close(); });
  if (dialog.id === 'settingsDialog') dialog.addEventListener('cancel', event => { event.preventDefault(); closeSettings(); });
  if (dialog.id === 'projectSettingsDialog') dialog.addEventListener('cancel', event => { event.preventDefault(); closeProjectSettings(); });
});
async function initialize() {
  try {
    const response = await fetch(`${API_ROOT}/bootstrap`); const bootstrap = await response.json();
    $('#networkLabel').textContent = `${bootstrap.host}:${bootstrap.port}`;
    if (bootstrap.onboardingRequired) { $('#onboardingDialog').showModal(); return; }
    if (bootstrap.pinRequired && !state.pin) { $('#authDialog').showModal(); return; }
    await load(); state.timer = setInterval(() => load({ quiet: true }), 4000);
  } catch { toast('No se pudo conectar con DevHubsito'); }
}
initialize();
