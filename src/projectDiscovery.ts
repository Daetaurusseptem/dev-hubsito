import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export type FrameworkKind = 'frontend' | 'backend' | 'fullstack' | 'unknown';
export type FrameworkDetection = {
  framework: string;
  kind: FrameworkKind;
  defaultPort: number;
  hostArgs: string[];
};

export type DiscoveredPackage = FrameworkDetection & {
  name: string;
  folder: string;
  relativePath: string;
  scripts: string[];
  watchScripts: string[];
  suggestedScript: string;
  watchEnabled: boolean;
  suggestedPort: number;
};

type PackageJson = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: unknown;
};

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.angular', 'coverage', '.cache']);

export function detectFramework(packageJson: PackageJson, files: Set<string> = new Set()): FrameworkDetection {
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const has = (name: string) => Boolean(dependencies[name]);
  if (has('@angular/core') || files.has('angular.json')) return { framework: 'Angular', kind: 'frontend', defaultPort: 4200, hostArgs: ['--host', '0.0.0.0'] };
  if (has('next')) return { framework: 'Next.js', kind: 'fullstack', defaultPort: 3000, hostArgs: ['--hostname', '0.0.0.0'] };
  if (has('nuxt')) return { framework: 'Nuxt', kind: 'fullstack', defaultPort: 3000, hostArgs: ['--host', '0.0.0.0'] };
  if (has('@nestjs/core')) return { framework: 'NestJS', kind: 'backend', defaultPort: 3000, hostArgs: [] };
  if (has('vite')) {
    const label = has('react') ? 'React + Vite' : has('vue') ? 'Vue + Vite' : has('svelte') ? 'Svelte + Vite' : 'Vite';
    return { framework: label, kind: 'frontend', defaultPort: 5173, hostArgs: ['--host', '0.0.0.0'] };
  }
  if (has('@sveltejs/kit')) return { framework: 'SvelteKit', kind: 'fullstack', defaultPort: 5173, hostArgs: ['--host', '0.0.0.0'] };
  if (has('astro')) return { framework: 'Astro', kind: 'frontend', defaultPort: 4321, hostArgs: ['--host', '0.0.0.0'] };
  if (has('hono')) return { framework: 'Hono', kind: 'backend', defaultPort: 3000, hostArgs: [] };
  if (has('fastify')) return { framework: 'Fastify', kind: 'backend', defaultPort: 3000, hostArgs: [] };
  if (has('express')) return { framework: 'Express', kind: 'backend', defaultPort: 3000, hostArgs: [] };
  if (has('react')) return { framework: 'React', kind: 'frontend', defaultPort: 3000, hostArgs: ['--host', '0.0.0.0'] };
  if (has('vue')) return { framework: 'Vue', kind: 'frontend', defaultPort: 5173, hostArgs: ['--host', '0.0.0.0'] };
  return { framework: 'Node/Bun', kind: 'unknown', defaultPort: 3000, hostArgs: [] };
}

export function chooseScript(scripts: Record<string, string> = {}): string {
  const runnable = runtimeScriptNames(scripts);
  const nameScore = (name: string) => name === 'dev' ? 45 : name === 'start:dev' ? 42 : /(^|:)watch(:|$)/i.test(name) ? 40 : name === 'serve' ? 32 : name === 'start' ? 22 : name === 'preview' ? 10 : 16;
  return runnable.sort((left, right) => {
    const rightScore = (isWatchScript(right, scripts[right]) ? 100 : 0) + nameScore(right);
    const leftScore = (isWatchScript(left, scripts[left]) ? 100 : 0) + nameScore(left);
    return rightScore - leftScore;
  })[0] || '';
}

export function isWatchScript(name: string, command = ''): boolean {
  if (/(^|:)(watch|hot)(:|$)/i.test(name)) return true;
  return /(\bng\s+serve\b|\bvite(?:\s|$)|\bnext\s+dev\b|\bnuxt\s+dev\b|\bastro\s+dev\b|\bsvelte-kit\s+dev\b|\bwebpack(?:-dev-server|\s+serve)\b|\breact-scripts\s+start\b|\bnest\s+start\b[^\r\n]*--watch\b|\bnodemon\b|\bts-node-dev\b|\btsx\s+watch\b|\bnode\s+--watch\b|\bbun\s+(?:run\s+)?--watch\b)/i.test(command);
}

export function runtimeScriptNames(scripts: Record<string, string> = {}): string[] {
  const unsafeName = /(^db:|^desktop:|test|build|lint|format|reset|migrat|seed|deploy|publish|delete|remove|clean|generate|typecheck|init|prepare|doctor)/i;
  const serverCommand = /(\bng\s+serve\b|\bvite\b|\bnext\s+dev\b|\bnuxt\s+dev\b|\bastro\s+dev\b|\bsvelte-kit\s+dev\b|\bwebpack(?:-dev-server|\s+serve)\b|\breact-scripts\s+start\b|\bnest\s+start\b|\bnodemon\b|\btsx\b|\bts-node(?:-dev)?\b|\bbun\s+(?:(?:run\s+)?--watch\s+)?[^\s]+\.(ts|js)\b|\bnode\s+(?:--watch\s+)?[^\s]+\.js\b)/i;
  return Object.entries(scripts)
    .filter(([name, command]) => !unsafeName.test(name) && (
      ['dev', 'start', 'serve', 'start:dev', 'preview'].includes(name)
      || serverCommand.test(command)
    ))
    .map(([name]) => name);
}

export function inferPort(scriptCommand: string | undefined, fallback: number): number {
  const match = scriptCommand?.match(/(?:--port(?:=|\s+)|-p\s+|PORT=)(\d{4,5})/i);
  const parsed = match ? Number(match[1]) : fallback;
  return parsed >= 1024 && parsed <= 65535 ? parsed : fallback;
}

export function classifyRepository(packageCount: number, gitRootCount: number, hasWorkspaceMarker: boolean): 'single' | 'monorepo' | 'multi-repo' {
  if (gitRootCount > 1) return 'multi-repo';
  if (hasWorkspaceMarker || packageCount > 1) return 'monorepo';
  return 'single';
}

async function packageFolders(root: string, maxDepth = 3): Promise<string[]> {
  const found: string[] = [];
  async function walk(folder: string, depth: number): Promise<void> {
    if (existsSync(path.join(folder, 'package.json'))) found.push(folder);
    if (depth >= maxDepth) return;
    const entries = await readdir(folder, { withFileTypes: true });
    await Promise.all(entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !IGNORED_DIRS.has(entry.name))
      .map((entry) => walk(path.join(folder, entry.name), depth + 1)));
  }
  await walk(root, 0);
  return [...new Set(found)];
}

async function nextFreePort(preferred: number, reserved: Set<number>, isOpen: (port: number) => Promise<boolean>): Promise<number> {
  let candidate = preferred;
  while (candidate <= 65535 && (reserved.has(candidate) || await isOpen(candidate))) candidate += 1;
  if (candidate > 65535) throw new Error('No se encontró un puerto libre');
  reserved.add(candidate);
  return candidate;
}

export async function discoverProject(
  root: string,
  reservedPorts: Set<number>,
  isOpen: (port: number) => Promise<boolean>,
) {
  const childFolders = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !IGNORED_DIRS.has(entry.name))
    .map((entry) => path.join(root, entry.name));
  const gitRoots = [root, ...childFolders].filter((folder) => existsSync(path.join(folder, '.git')));
  const scanRoots = gitRoots.length > 1 && !existsSync(path.join(root, '.git')) ? gitRoots : [root];
  const folders = [...new Set((await Promise.all(scanRoots.map((folder) => packageFolders(folder)))).flat())];
  if (folders.length === 0) throw new Error('No se encontraron package.json en esta carpeta');
  const gitRootCount = gitRoots.length;
  const rootPackage = existsSync(path.join(root, 'package.json'))
    ? JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as PackageJson
    : null;
  const hasWorkspaceMarker = Boolean(rootPackage?.workspaces)
    || ['pnpm-workspace.yaml', 'nx.json', 'turbo.json', 'lerna.json'].some((file) => existsSync(path.join(root, file)));

  const packages: DiscoveredPackage[] = [];
  for (const folder of folders) {
    const packageJson = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8')) as PackageJson;
    const files = new Set((await readdir(folder)).filter((name) => ['angular.json', 'vite.config.ts', 'next.config.js', 'nuxt.config.ts'].includes(name)));
    const detection = detectFramework(packageJson, files);
    const runnableScripts = runtimeScriptNames(packageJson.scripts);
    const suggestedScript = chooseScript(packageJson.scripts);
    if (!suggestedScript) continue;
    const preferredPort = inferPort(packageJson.scripts?.[suggestedScript], detection.defaultPort);
    packages.push({
      ...detection,
      name: packageJson.name || path.basename(folder),
      folder,
      relativePath: path.relative(root, folder) || '.',
      scripts: runnableScripts,
      watchScripts: runnableScripts.filter((script) => isWatchScript(script, packageJson.scripts?.[script])),
      suggestedScript,
      watchEnabled: isWatchScript(suggestedScript, packageJson.scripts?.[suggestedScript]),
      suggestedPort: await nextFreePort(preferredPort, reservedPorts, isOpen),
    });
  }
  if (packages.length === 0) throw new Error('Se encontraron paquetes, pero ninguno tiene scripts ejecutables');
  return {
    name: rootPackage?.name || path.basename(root),
    folder: root,
    repositoryMode: classifyRepository(packages.length, gitRootCount, hasWorkspaceMarker),
    gitRootCount,
    packages,
  };
}
