import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { networkInterfaces } from 'node:os';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import {
  isValidPort,
  isValidScriptName,
  normalizeArgs,
  resolveAllowedPath,
  slugify,
} from './projectPolicy';
import { discoverProject, isWatchScript, runtimeScriptNames } from './projectDiscovery';

type ServiceKind = 'process' | 'docker-compose';
type ServiceConfig = {
  id: string;
  name: string;
  kind: ServiceKind;
  cwd: string;
  command?: string[];
  composeService?: string;
  port: number;
  path?: string;
  openable?: boolean;
  framework?: string;
  script?: string;
  watch?: boolean;
  env?: Record<string, string>;
};
type ProjectConfig = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  iconMode?: 'favicon' | 'custom';
  services: ServiceConfig[];
};
type HubConfig = { projects: ProjectConfig[] };
type HubSettings = {
  preset: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  radius: number;
  density: 'compact' | 'comfortable' | 'spacious';
  glass: number;
  glow: number;
  pattern: 'aurora' | 'grid' | 'none';
  projectIcons: Record<string, string>;
  waifu: WaifuSettings;
};
type WaifuSettings = {
  enabled: boolean;
  mode: 'full' | 'compact' | 'hidden';
  profile: 'responsive' | 'calm' | 'silent';
  name: string;
  sprite: string;
  columns: number;
  rows: number;
  frame: number;
  scale: number;
  frames: Record<'idle' | 'focus' | 'success' | 'warning' | 'error' | 'sleep', number>;
};
type SecuritySettings = {
  onboardingComplete: boolean;
  pinRequired: boolean;
  pinSalt: string;
  pinHash: string;
};
type ManagedProcess = {
  subprocess: Bun.Subprocess;
  logs: string[];
  startedAt: string;
};

const HUB_DIR = path.resolve(import.meta.dir, '..');
const WORKSPACE_ROOT = path.resolve(HUB_DIR, '..');
const STORAGE_DIR = path.resolve(process.env.DEVHUBSITO_DATA_DIR || HUB_DIR);
const CONFIG_PATH = path.join(STORAGE_DIR, 'projects.json');
const ROOTS_PATH = path.join(STORAGE_DIR, 'allowed-roots.json');
const SETTINGS_PATH = path.join(STORAGE_DIR, 'settings.json');
const SECURITY_PATH = path.join(STORAGE_DIR, 'security.json');
const PUBLIC_DIR = path.resolve(process.env.DEVHUBSITO_PUBLIC_DIR || path.join(HUB_DIR, 'public'));
const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');
const PORT = Number(process.env.DEV_HUB_PORT || 4173);
const HOST = process.env.DEV_HUB_HOST || '0.0.0.0';
const BUN_BIN = process.env.BUN_BIN || (process.env.DEVHUBSITO_DESKTOP ? 'bun' : process.execPath);
const SERVER_VERSION = process.env.DEVHUBSITO_SERVER_VERSION || 'dev';
const DOCKER_BIN = process.env.DOCKER_BIN
  || 'C:\\Users\\jaime\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe';
const DEFAULT_ALLOWED_ROOTS = (process.env.DEV_HUB_ALLOWED_ROOTS || WORKSPACE_ROOT)
  .split(';')
  .map((item) => path.resolve(item.trim()))
  .filter(Boolean);
let ALLOWED_ROOTS = [...DEFAULT_ALLOWED_ROOTS];
await mkdir(STORAGE_DIR, { recursive: true });
if (!existsSync(CONFIG_PATH)) await writeFile(CONFIG_PATH, '{\n  "projects": []\n}\n', 'utf8');
if (existsSync(ROOTS_PATH)) {
  try {
    const saved = JSON.parse(await readFile(ROOTS_PATH, 'utf8')) as unknown;
    if (Array.isArray(saved)) {
      ALLOWED_ROOTS = [...new Set([...DEFAULT_ALLOWED_ROOTS, ...saved.filter((item): item is string => typeof item === 'string').map((item) => path.resolve(item))])];
    }
  } catch { /* Keep environment defaults when the optional file is invalid. */ }
}
const managed = new Map<string, ManagedProcess>();
const DEFAULT_SETTINGS: HubSettings = {
  preset: 'aurora', accent: '#7c3aed', background: '#080b14', surface: '#111725', text: '#e8ecf7',
  radius: 20, density: 'comfortable', glass: 14, glow: 22, pattern: 'aurora', projectIcons: {},
  waifu: { enabled: true, mode: 'full', profile: 'responsive', name: 'Kira', sprite: '/waifu-default.png', columns: 4, rows: 4, frame: 2, scale: 100, frames: { idle: 2, focus: 0, success: 1, warning: 6, error: 11, sleep: 12 } },
};
const DEFAULT_SECURITY: SecuritySettings = { onboardingComplete: false, pinRequired: false, pinSalt: '', pinHash: '' };

function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, x-dev-hub-pin', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', ...init.headers },
  });
}

async function loadConfig(): Promise<HubConfig> {
  return JSON.parse(await readFile(CONFIG_PATH, 'utf8')) as HubConfig;
}

async function saveConfig(config: HubConfig): Promise<void> {
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

async function loadSettings(): Promise<HubSettings> {
  if (!existsSync(SETTINGS_PATH)) return structuredClone(DEFAULT_SETTINGS);
  try {
    const saved = JSON.parse(await readFile(SETTINGS_PATH, 'utf8')) as Partial<HubSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      projectIcons: { ...DEFAULT_SETTINGS.projectIcons, ...(saved.projectIcons || {}) },
      waifu: { ...DEFAULT_SETTINGS.waifu, ...(saved.waifu || {}), frames: { ...DEFAULT_SETTINGS.waifu.frames, ...(saved.waifu?.frames || {}) } },
    };
  } catch { return structuredClone(DEFAULT_SETTINGS); }
}

async function loadSecurity(): Promise<SecuritySettings> {
  if (!existsSync(SECURITY_PATH)) return structuredClone(DEFAULT_SECURITY);
  try {
    const saved = JSON.parse(await readFile(SECURITY_PATH, 'utf8')) as Partial<SecuritySettings>;
    return { ...DEFAULT_SECURITY, ...saved };
  } catch { return structuredClone(DEFAULT_SECURITY); }
}

function pinDigest(pin: string, salt: string): string {
  return scryptSync(pin, salt, 32).toString('hex');
}

async function saveOnboarding(input: Record<string, unknown>): Promise<{ pinRequired: boolean; settings: HubSettings }> {
  const current = await loadSecurity();
  if (current.onboardingComplete) throw Object.assign(new Error('El onboarding ya fue completado'), { status: 409 });
  const pinRequired = input.pinRequired === true;
  const pin = String(input.pin || '');
  if (pinRequired && !/^\d{4,12}$/.test(pin)) {
    throw Object.assign(new Error('El PIN debe tener entre 4 y 12 dígitos'), { status: 400 });
  }
  const pinSalt = pinRequired ? randomBytes(16).toString('hex') : '';
  const security: SecuritySettings = {
    onboardingComplete: true,
    pinRequired,
    pinSalt,
    pinHash: pinRequired ? pinDigest(pin, pinSalt) : '',
  };
  await writeFile(SECURITY_PATH, `${JSON.stringify(security, null, 2)}\n`, 'utf8');
  const settings = await loadSettings();
  settings.waifu.enabled = input.waifuEnabled !== false;
  settings.waifu.mode = settings.waifu.enabled ? 'full' : 'hidden';
  await writeFile(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return { pinRequired, settings };
}

function validColor(value: unknown, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
}

async function saveSettings(input: Record<string, unknown>): Promise<HubSettings> {
  const current = await loadSettings();
  const icons = input.projectIcons && typeof input.projectIcons === 'object'
    ? Object.fromEntries(Object.entries(input.projectIcons as Record<string, unknown>)
        .filter(([key, value]) => /^[a-z0-9-]{1,50}$/.test(key) && typeof value === 'string')
        .map(([key, value]) => [key, String(value).trim().slice(0, 8)]))
    : current.projectIcons;
  const density = ['compact', 'comfortable', 'spacious'].includes(String(input.density)) ? input.density as HubSettings['density'] : current.density;
  const pattern = ['aurora', 'grid', 'none'].includes(String(input.pattern)) ? input.pattern as HubSettings['pattern'] : current.pattern;
  const rawWaifu = input.waifu && typeof input.waifu === 'object' ? input.waifu as Record<string, unknown> : {};
  const columns = Math.min(12, Math.max(1, Number(rawWaifu.columns) || current.waifu.columns));
  const rows = Math.min(12, Math.max(1, Number(rawWaifu.rows) || current.waifu.rows));
  const spriteCandidate = String(rawWaifu.sprite || current.waifu.sprite);
  const sprite = spriteCandidate === '/waifu-default.png' || /^\/uploads\/[a-z0-9._-]+$/i.test(spriteCandidate)
    ? spriteCandidate : current.waifu.sprite;
  const mode = ['full', 'compact', 'hidden'].includes(String(rawWaifu.mode))
    ? rawWaifu.mode as WaifuSettings['mode'] : (rawWaifu.enabled === false ? 'hidden' : current.waifu.mode);
  const profile = ['responsive', 'calm', 'silent'].includes(String(rawWaifu.profile))
    ? rawWaifu.profile as WaifuSettings['profile'] : current.waifu.profile;
  const rawFrames = rawWaifu.frames && typeof rawWaifu.frames === 'object' ? rawWaifu.frames as Record<string, unknown> : {};
  const frameFor = (key: keyof WaifuSettings['frames']) => Math.min(columns * rows - 1, Math.max(0, Number(rawFrames[key] ?? current.waifu.frames[key]) || 0));
  const settings: HubSettings = {
    preset: String(input.preset || current.preset).slice(0, 30),
    accent: validColor(input.accent, current.accent), background: validColor(input.background, current.background),
    surface: validColor(input.surface, current.surface), text: validColor(input.text, current.text),
    radius: Math.min(32, Math.max(4, Number(input.radius) || current.radius)), density,
    glass: Math.min(30, Math.max(0, Number(input.glass) || 0)),
    glow: Math.min(100, Math.max(0, Number(input.glow) || 0)), pattern, projectIcons: icons,
    waifu: {
      enabled: mode !== 'hidden', mode, profile,
      name: String(rawWaifu.name || current.waifu.name).trim().slice(0, 30) || 'Waifu',
      sprite,
      columns,
      rows,
      frame: Math.min(columns * rows - 1, Math.max(0, Number(rawWaifu.frame) || 0)),
      scale: Math.min(140, Math.max(70, Number(rawWaifu.scale) || current.waifu.scale)),
      frames: { idle: frameFor('idle'), focus: frameFor('focus'), success: frameFor('success'), warning: frameFor('warning'), error: frameFor('error'), sleep: frameFor('sleep') },
    },
  };
  await writeFile(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return settings;
}

function findService(config: HubConfig, serviceId: string): { project: ProjectConfig; service: ServiceConfig } | null {
  for (const project of config.projects) {
    const service = project.services.find((item) => item.id === serviceId);
    if (service) return { project, service };
  }
  return null;
}

function localIp(): string {
  const interfaces = networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal && entry.address.startsWith('192.168.')) return entry.address;
    }
  }
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return 'localhost';
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(350);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function appendLog(serviceId: string, value: string): void {
  const entry = managed.get(serviceId);
  if (!entry) return;
  const lines = value.replace(/\r/g, '').split('\n').filter(Boolean);
  entry.logs.push(...lines.map((line) => `[${new Date().toLocaleTimeString()}] ${line}`));
  if (entry.logs.length > 300) entry.logs.splice(0, entry.logs.length - 300);
}

async function capture(serviceId: string, stream: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!stream) return;
  const decoder = new TextDecoder();
  for await (const chunk of stream) appendLog(serviceId, decoder.decode(chunk));
}

function serviceCwd(service: ServiceConfig): string {
  const resolved = resolveAllowedPath(service.cwd, ALLOWED_ROOTS);
  if (!resolved) throw new Error('La carpeta del servicio está fuera de las raíces permitidas');
  return resolved;
}

async function serviceUsesWatch(service: ServiceConfig): Promise<boolean> {
  if (typeof service.watch === 'boolean') return service.watch;
  if (service.kind !== 'process' || !service.script) return false;
  try {
    const packageJson = JSON.parse(await readFile(path.join(serviceCwd(service), 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    return isWatchScript(service.script, packageJson.scripts?.[service.script]);
  } catch { return false; }
}

function commandFor(service: ServiceConfig, action: 'start' | 'stop'): string[] {
  if (service.kind === 'docker-compose') {
    return [
      DOCKER_BIN,
      'compose',
      '-f',
      path.join(serviceCwd(service), 'compose.yaml'),
      action === 'start' ? 'up' : 'stop',
      ...(action === 'start' ? ['-d'] : []),
      service.composeService || '',
    ].filter(Boolean);
  }
  return (service.command || []).map((part) => part === '$BUN' ? BUN_BIN : part);
}

async function startService(service: ServiceConfig): Promise<{ message: string }> {
  if (await isPortOpen(service.port)) return { message: 'El servicio ya está escuchando' };
  const command = commandFor(service, 'start');
  if (command.length === 0) throw new Error('El servicio no tiene comando de inicio');
  const subprocess = Bun.spawn(command, {
    cwd: serviceCwd(service),
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    windowsHide: true,
    env: { ...process.env, ...service.env, FORCE_COLOR: '0' },
  });
  const entry: ManagedProcess = { subprocess, logs: [], startedAt: new Date().toISOString() };
  managed.set(service.id, entry);
  void capture(service.id, subprocess.stdout);
  void capture(service.id, subprocess.stderr);
  if (service.kind === 'docker-compose') {
    const exitCode = await subprocess.exited;
    if (exitCode !== 0) throw new Error(entry.logs.slice(-8).join('\n') || 'Docker Compose no pudo iniciar');
    managed.delete(service.id);
  }
  return { message: await serviceUsesWatch(service) ? 'Servicio iniciado con watch' : 'Servicio iniciado' };
}

async function stopTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    const killer = Bun.spawn(['taskkill', '/PID', String(pid), '/T', '/F'], {
      stdout: 'ignore', stderr: 'ignore', windowsHide: true,
    });
    await killer.exited;
    return;
  }
  process.kill(pid, 'SIGTERM');
}

async function stopService(service: ServiceConfig): Promise<{ message: string }> {
  if (service.kind === 'docker-compose') {
    const subprocess = Bun.spawn(commandFor(service, 'stop'), {
      cwd: serviceCwd(service), stdout: 'pipe', stderr: 'pipe', windowsHide: true,
    });
    const output = `${await new Response(subprocess.stdout).text()}${await new Response(subprocess.stderr).text()}`;
    if (await subprocess.exited !== 0) throw new Error(output || 'Docker Compose no pudo detener el servicio');
    return { message: 'Servicio detenido' };
  }
  const entry = managed.get(service.id);
  if (!entry) {
    if (await isPortOpen(service.port)) {
      throw Object.assign(new Error('El proceso fue iniciado fuera del Hub; reinícialo desde aquí para administrarlo'), { status: 409 });
    }
    return { message: 'El servicio ya está detenido' };
  }
  await stopTree(entry.subprocess.pid);
  managed.delete(service.id);
  return { message: 'Servicio detenido' };
}

async function serviceView(service: ServiceConfig) {
  const running = await isPortOpen(service.port);
  const entry = managed.get(service.id);
  if (entry && entry.subprocess.exitCode !== null) managed.delete(service.id);
  const ownership = running ? (managed.has(service.id) ? 'managed' : 'external') : 'stopped';
  const host = localIp();
  return {
    ...service,
    watch: await serviceUsesWatch(service),
    running,
    ownership,
    url: service.openable === false ? null : `http://${host}:${service.port}${service.path || '/'}`,
    startedAt: managed.get(service.id)?.startedAt || null,
  };
}

async function authorized(request: Request): Promise<boolean> {
  const security = await loadSecurity();
  if (!security.onboardingComplete || !security.pinRequired) return security.onboardingComplete;
  const header = request.headers.get('authorization') || '';
  const pin = header.startsWith('Bearer ') ? header.slice(7) : request.headers.get('x-dev-hub-pin') || '';
  if (!pin || !security.pinSalt || !security.pinHash) return false;
  const actual = Buffer.from(pinDigest(pin, security.pinSalt), 'hex');
  const expected = Buffer.from(security.pinHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  try { return await request.json() as Record<string, unknown>; } catch { return {}; }
}

async function systemDrives(): Promise<Array<{ name: string; path: string }>> {
  if (process.platform !== 'win32') return [{ name: '/', path: '/' }];
  const systemDrive = process.env.SystemDrive || 'C:';
  const fallback = new Set<string>([
    /^[a-z]:$/i.test(systemDrive) ? `${systemDrive}\\` : path.parse(systemDrive).root,
    ...ALLOWED_ROOTS.map((root) => path.parse(root).root),
  ].filter(Boolean));
  try {
    const probe = Bun.spawn([
      'powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      'Get-PSDrive -PSProvider FileSystem | ForEach-Object { $_.Root }',
    ], { stdout: 'pipe', stderr: 'ignore', windowsHide: true });
    const output = await Promise.race([
      new Response(probe.stdout).text(),
      Bun.sleep(1500).then(() => { probe.kill(); return ''; }),
    ]);
    for (const drive of output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
      if (/^[a-z]:\\$/i.test(drive)) fallback.add(drive);
    }
  } catch { /* The known system and configured roots remain available. */ }
  return [...fallback].sort().map((drive) => ({ name: drive, path: drive }));
}

async function browseDirectories(inputPath: string | null, unrestricted = false) {
  if (!inputPath) {
    return {
      mode: 'roots', current: null, parent: null, breadcrumbs: [],
      entries: unrestricted ? await systemDrives() : ALLOWED_ROOTS.map((root) => ({ name: root, path: root })),
    };
  }

  const current = unrestricted ? path.resolve(inputPath) : resolveAllowedPath(inputPath, ALLOWED_ROOTS);
  if (!current || !existsSync(current)) {
    throw Object.assign(new Error('La carpeta está fuera de las raíces permitidas'), { status: 403 });
  }
  const root = unrestricted ? path.parse(current).root : ALLOWED_ROOTS.find((candidate) => {
    const relative = path.relative(candidate, current);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
  if (!root) throw Object.assign(new Error('La carpeta está fuera de las raíces permitidas'), { status: 403 });

  let entries: Array<{ name: string; path: string }>;
  try {
    entries = (await readdir(current, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => ({ name: entry.name, path: path.join(current, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  } catch {
    throw Object.assign(new Error('No fue posible leer esta carpeta'), { status: 403 });
  }

  const relative = path.relative(root, current);
  const segments = relative ? relative.split(path.sep).filter(Boolean) : [];
  const breadcrumbs = [{ name: path.basename(root) || root, path: root }];
  let cursor = root;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    breadcrumbs.push({ name: segment, path: cursor });
  }
  const parent = current === root ? null : resolveAllowedPath(path.dirname(current), [root]);
  return { mode: 'directory', root, current, parent, breadcrumbs, entries };
}

async function addAllowedRoot(input: Record<string, unknown>) {
  const requested = String(input.path || '').trim();
  if (!requested || !path.isAbsolute(requested)) {
    throw Object.assign(new Error('Selecciona una carpeta válida'), { status: 400 });
  }
  const root = path.resolve(requested);
  try {
    if (!(await stat(root)).isDirectory()) throw new Error();
  } catch {
    throw Object.assign(new Error('La carpeta no existe o no se puede leer'), { status: 400 });
  }
  if (!ALLOWED_ROOTS.some((item) => item.localeCompare(root, undefined, { sensitivity: 'accent' }) === 0)) {
    ALLOWED_ROOTS.push(root);
    await writeFile(ROOTS_PATH, `${JSON.stringify(ALLOWED_ROOTS, null, 2)}\n`, 'utf8');
  }
  return { message: 'Ubicación agregada', root, allowedRoots: ALLOWED_ROOTS };
}

async function updateProject(project: ProjectConfig, input: Record<string, unknown>): Promise<ProjectConfig> {
  const name = String(input.name || project.name).trim();
  if (name.length < 2 || name.length > 80) throw Object.assign(new Error('El nombre debe tener entre 2 y 80 caracteres'), { status: 400 });
  project.name = name;
  project.description = String(input.description ?? project.description ?? '').trim().slice(0, 180);
  project.color = validColor(input.color, project.color || '#2563eb');
  if (input.iconMode === 'favicon' || input.iconMode === 'custom') project.iconMode = input.iconMode;
  const config = await loadConfig();
  config.projects = config.projects.map((item) => item.id === project.id ? project : item);
  await saveConfig(config);
  return project;
}

async function uploadProjectIcon(project: ProjectConfig, request: Request): Promise<ProjectConfig> {
  const form = await request.formData();
  const entry = form.get('icon');
  if (!entry || typeof entry === 'string' || typeof entry.arrayBuffer !== 'function') {
    throw Object.assign(new Error('Selecciona una imagen'), { status: 400 });
  }
  const file = entry as File;
  if (file.size === 0 || file.size > 2 * 1024 * 1024) throw Object.assign(new Error('La imagen debe pesar máximo 2 MB'), { status: 400 });
  const extensions: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
    'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico',
  };
  const extension = extensions[file.type] || (file.name.toLowerCase().endsWith('.ico') ? 'ico' : '');
  if (!extension) throw Object.assign(new Error('Usa una imagen PNG, JPG, WebP o ICO'), { status: 400 });
  await mkdir(UPLOADS_DIR, { recursive: true });
  const fileName = `${project.id}-${Date.now()}.${extension}`;
  await writeFile(path.join(UPLOADS_DIR, fileName), new Uint8Array(await file.arrayBuffer()));
  project.icon = `/uploads/${fileName}`;
  project.iconMode = 'custom';
  const config = await loadConfig();
  config.projects = config.projects.map((item) => item.id === project.id ? project : item);
  await saveConfig(config);
  return project;
}

async function uploadWaifuSprite(request: Request): Promise<HubSettings> {
  const form = await request.formData();
  const entry = form.get('sprite');
  if (!entry || typeof entry === 'string' || typeof entry.arrayBuffer !== 'function') {
    throw Object.assign(new Error('Selecciona un spritesheet'), { status: 400 });
  }
  const file = entry as File;
  if (file.size === 0 || file.size > 12 * 1024 * 1024) {
    throw Object.assign(new Error('El spritesheet debe pesar máximo 12 MB'), { status: 400 });
  }
  const extensions: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp' };
  const extension = extensions[file.type];
  if (!extension) throw Object.assign(new Error('Usa un spritesheet PNG o WebP'), { status: 400 });
  await mkdir(UPLOADS_DIR, { recursive: true });
  const fileName = `waifu-${Date.now()}.${extension}`;
  await writeFile(path.join(UPLOADS_DIR, fileName), new Uint8Array(await file.arrayBuffer()));
  const settings = await loadSettings();
  settings.waifu = { ...settings.waifu, enabled: true, sprite: `/uploads/${fileName}`, frame: 0 };
  await writeFile(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return settings;
}

async function addProject(input: Record<string, unknown>): Promise<ProjectConfig> {
  const name = String(input.name || '').trim();
  const folder = String(input.folder || '').trim();
  if (name.length < 2) throw Object.assign(new Error('Escribe un nombre de proyecto'), { status: 400 });
  const projectPath = resolveAllowedPath(folder, ALLOWED_ROOTS);
  if (!projectPath || !existsSync(projectPath)) throw Object.assign(new Error('La carpeta no existe o está fuera de las raíces permitidas'), { status: 400 });

  const config = await loadConfig();
  const id = slugify(name);
  if (!id || config.projects.some((item) => item.id === id)) throw Object.assign(new Error('Ya existe un proyecto con ese nombre'), { status: 409 });
  const requestedServices = Array.isArray(input.services)
    ? input.services.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : [{
        relativePath: '.', name: 'Web', script: input.script, port: input.port,
        args: input.args, framework: 'Node/Bun', openable: true,
      }];
  if (requestedServices.length === 0) throw Object.assign(new Error('Selecciona al menos un servicio'), { status: 400 });

  const usedPorts = new Set<number>([PORT, ...config.projects.flatMap((project) => project.services.map((service) => service.port))]);
  const services: ServiceConfig[] = [];
  for (const raw of requestedServices) {
    const relativePath = String(raw.relativePath || '.');
    const packageFolder = path.resolve(projectPath, relativePath);
    const relativeToProject = path.relative(projectPath, packageFolder);
    if (relativeToProject.startsWith('..') || path.isAbsolute(relativeToProject) || !resolveAllowedPath(packageFolder, ALLOWED_ROOTS)) {
      throw Object.assign(new Error('Uno de los paquetes está fuera de la carpeta seleccionada'), { status: 400 });
    }
    const packagePath = path.join(packageFolder, 'package.json');
    if (!existsSync(packagePath)) throw Object.assign(new Error(`No existe package.json en ${relativePath}`), { status: 400 });
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as { name?: string; scripts?: Record<string, string> };
    const script = raw.script;
    if (!isValidScriptName(script) || !packageJson.scripts?.[script] || !runtimeScriptNames(packageJson.scripts).includes(script)) {
      throw Object.assign(new Error(`El script ${String(script || '')} no existe en ${relativePath}/package.json`), { status: 400 });
    }
    const port = Number(raw.port);
    if (!isValidPort(port)) throw Object.assign(new Error('Todos los puertos deben estar entre 1024 y 65535'), { status: 400 });
    if (usedPorts.has(port) || await isPortOpen(port)) {
      throw Object.assign(new Error(`El puerto ${port} está repetido, registrado u ocupado`), { status: 409 });
    }
    usedPorts.add(port);
    const workspaceRelative = path.relative(WORKSPACE_ROOT, packageFolder);
    const cwd = workspaceRelative === '' ? '.' : workspaceRelative.startsWith('..') || path.isAbsolute(workspaceRelative) ? packageFolder : workspaceRelative;
    const serviceName = String(raw.name || packageJson.name || path.basename(packageFolder)).trim().slice(0, 80);
    services.push({
      id: `${id}-${slugify(serviceName) || 'service'}-${services.length + 1}`,
      name: serviceName,
      kind: 'process',
      cwd,
      command: ['$BUN', 'run', String(script), ...normalizeArgs(raw.args)],
      script: String(script),
      watch: isWatchScript(String(script), packageJson.scripts[script]),
      framework: String(raw.framework || 'Node/Bun').slice(0, 50),
      env: { PORT: String(port), HOST: '0.0.0.0' },
      port,
      path: '/',
      openable: raw.openable !== false,
    });
  }
  const project: ProjectConfig = {
    id,
    name,
    description: String(input.description || '').trim().slice(0, 180),
    color: /^#[0-9a-f]{6}$/i.test(String(input.color || '')) ? String(input.color) : '#2563eb',
    services,
  };
  config.projects.push(project);
  await saveConfig(config);
  return project;
}

async function api(request: Request, url: URL): Promise<Response> {
  if (url.pathname === '/api/bootstrap') {
    const security = await loadSecurity();
    return json({
      name: 'DevHubsito', host: localIp(), port: PORT,
      desktopMode: process.env.DEVHUBSITO_DESKTOP === '1', serverVersion: SERVER_VERSION,
      onboardingRequired: !security.onboardingComplete,
      pinRequired: security.onboardingComplete && security.pinRequired,
    });
  }
  if (url.pathname === '/api/onboarding' && request.method === 'POST') {
    return json(await saveOnboarding(await parseBody(request)), { status: 201 });
  }
  if (!await authorized(request)) return json({ message: 'PIN incorrecto' }, { status: 401 });

  const config = await loadConfig();
  if (url.pathname === '/api/projects' && request.method === 'GET') {
    const projects = await Promise.all(config.projects.map(async (project) => ({
      ...project,
      services: await Promise.all(project.services.map(serviceView)),
    })));
    return json({ projects, host: localIp(), allowedRoots: ALLOWED_ROOTS, settings: await loadSettings() });
  }
  if (url.pathname === '/api/settings' && request.method === 'PUT') {
    return json(await saveSettings(await parseBody(request)));
  }
  if (url.pathname === '/api/waifu/sprite' && request.method === 'POST') {
    return json(await uploadWaifuSprite(request));
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    return json(await addProject(await parseBody(request)), { status: 201 });
  }
  if (url.pathname === '/api/discovery' && request.method === 'POST') {
    const input = await parseBody(request);
    const folder = String(input.folder || '').trim();
    const projectPath = resolveAllowedPath(folder, ALLOWED_ROOTS);
    if (!projectPath || !existsSync(projectPath)) {
      return json({ message: 'La carpeta no existe o está fuera de las raíces permitidas' }, { status: 400 });
    }
    const reserved = new Set<number>([
      PORT,
      ...config.projects.flatMap((project) => project.services.map((service) => service.port)),
    ]);
    return json(await discoverProject(projectPath, reserved, isPortOpen));
  }
  if (url.pathname === '/api/filesystem' && request.method === 'GET') {
    return json(await browseDirectories(url.searchParams.get('path'), url.searchParams.get('scope') === 'system'));
  }
  if (url.pathname === '/api/roots' && request.method === 'POST') {
    return json(await addAllowedRoot(await parseBody(request)), { status: 201 });
  }

  const actionMatch = url.pathname.match(/^\/api\/services\/([^/]+)\/(start|stop|restart)$/);
  if (actionMatch && request.method === 'POST') {
    const found = findService(config, decodeURIComponent(actionMatch[1]));
    if (!found) return json({ message: 'Servicio no encontrado' }, { status: 404 });
    const action = actionMatch[2];
    if (action === 'stop') return json(await stopService(found.service));
    if (action === 'restart') {
      await stopService(found.service);
      await Bun.sleep(350);
    }
    return json(await startService(found.service));
  }

  const projectIconMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/icon$/);
  if (projectIconMatch && request.method === 'POST') {
    const project = config.projects.find((item) => item.id === decodeURIComponent(projectIconMatch[1]));
    if (!project) return json({ message: 'Proyecto no encontrado' }, { status: 404 });
    return json(await uploadProjectIcon(project, request));
  }

  const projectUpdateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectUpdateMatch && request.method === 'PATCH') {
    const project = config.projects.find((item) => item.id === decodeURIComponent(projectUpdateMatch[1]));
    if (!project) return json({ message: 'Proyecto no encontrado' }, { status: 404 });
    return json(await updateProject(project, await parseBody(request)));
  }

  const logMatch = url.pathname.match(/^\/api\/services\/([^/]+)\/logs$/);
  if (logMatch && request.method === 'GET') {
    const id = decodeURIComponent(logMatch[1]);
    const found = findService(config, id);
    if (!found) return json({ message: 'Servicio no encontrado' }, { status: 404 });
    return json({ logs: managed.get(id)?.logs || [], managed: managed.has(id) });
  }

  const projectAction = url.pathname.match(/^\/api\/projects\/([^/]+)\/(start|stop)$/);
  if (projectAction && request.method === 'POST') {
    const project = config.projects.find((item) => item.id === decodeURIComponent(projectAction[1]));
    if (!project) return json({ message: 'Proyecto no encontrado' }, { status: 404 });
    const results: Array<{ service: string; message: string; ok: boolean }> = [];
    const services = projectAction[2] === 'stop' ? [...project.services].reverse() : project.services;
    for (const service of services) {
      try {
        const result = projectAction[2] === 'start' ? await startService(service) : await stopService(service);
        results.push({ service: service.name, message: result.message, ok: true });
      } catch (error: any) {
        results.push({ service: service.name, message: error?.message || 'No fue posible completar la acción', ok: false });
      }
    }
    return json({ message: `Proyecto ${projectAction[2] === 'start' ? 'iniciado' : 'detenido'}`, results });
  }

  const deleteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (deleteMatch && request.method === 'DELETE') {
    const id = decodeURIComponent(deleteMatch[1]);
    const project = config.projects.find((item) => item.id === id);
    if (!project) return json({ message: 'Proyecto no encontrado' }, { status: 404 });
    if (project.services.some((service) => managed.has(service.id) || service.kind === 'docker-compose')) {
      return json({ message: 'Detén los servicios administrados antes de quitar el proyecto' }, { status: 409 });
    }
    config.projects = config.projects.filter((item) => item.id !== id);
    await saveConfig(config);
    return json({ message: 'Proyecto quitado del Hub; sus archivos no fueron modificados' });
  }

  return json({ message: 'Ruta no encontrada' }, { status: 404 });
}

function contentType(filePath: string): string {
  return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' } as Record<string, string>)[path.extname(filePath)] || 'application/octet-stream';
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, x-dev-hub-pin', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' } });
      if (url.pathname.startsWith('/api/')) return await api(request, url);
      if (url.pathname.startsWith('/uploads/')) {
        const uploadPath = path.resolve(UPLOADS_DIR, url.pathname.slice('/uploads/'.length));
        const uploadRelative = path.relative(UPLOADS_DIR, uploadPath);
        if (uploadRelative.startsWith('..') || path.isAbsolute(uploadRelative) || !existsSync(uploadPath)) return new Response('Not found', { status: 404 });
        return new Response(Bun.file(uploadPath), { headers: { 'content-type': contentType(uploadPath) } });
      }
      const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const filePath = path.resolve(PUBLIC_DIR, relative);
      const publicRelative = path.relative(PUBLIC_DIR, filePath);
      if (publicRelative.startsWith('..') || path.isAbsolute(publicRelative) || !existsSync(filePath)) {
        return new Response('Not found', { status: 404 });
      }
      return new Response(Bun.file(filePath), { headers: { 'content-type': contentType(filePath) } });
    } catch (error: any) {
      console.error(error);
      return json({ message: error?.message || 'Error interno' }, { status: error?.status || 500 });
    }
  },
});

console.log(`Dev Hub listo en http://${localIp()}:${server.port}`);
