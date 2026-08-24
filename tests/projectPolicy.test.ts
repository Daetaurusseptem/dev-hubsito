import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isValidPort, isValidScriptName, normalizeArgs, resolveAllowedPath, slugify } from '../src/projectPolicy';
import { chooseScript, classifyRepository, detectFramework, discoverProject, inferPort, isWatchScript, runtimeScriptNames } from '../src/projectDiscovery';
import { frontendUrlForService } from '../src/serviceRuntime';

describe('Dev Hub project policy', () => {
  test('creates stable safe ids', () => {
    expect(slugify('Mi Proyecto Ágil!')).toBe('mi-proyecto-agil');
  });

  test('keeps project paths inside configured roots', () => {
    const root = path.resolve('C:/workspace');
    expect(resolveAllowedPath('apps/demo', [root])).toBe(path.resolve(root, 'apps/demo'));
    expect(resolveAllowedPath('../secret', [root])).toBeNull();
    expect(resolveAllowedPath('D:/outside', [root])).toBeNull();
  });

  test('validates executable metadata without accepting shell text', () => {
    expect(isValidPort(4200)).toBe(true);
    expect(isValidPort(80)).toBe(false);
    expect(isValidScriptName('dev:web')).toBe(true);
    expect(isValidScriptName('dev && erase')).toBe(false);
    expect(normalizeArgs(['--host', '0.0.0.0', '', 12])).toEqual(['--host', '0.0.0.0']);
  });
});

describe('project framework discovery', () => {
  test('detects common frontend and backend frameworks', () => {
    expect(detectFramework({ dependencies: { '@angular/core': '21' } }).framework).toBe('Angular');
    expect(detectFramework({ dependencies: { react: '19' }, devDependencies: { vite: '7' } }).framework).toBe('React + Vite');
    expect(detectFramework({ dependencies: { express: '5' } })).toMatchObject({ framework: 'Express', kind: 'backend' });
  });

  test('chooses commands, ports and repository shape', () => {
    expect(chooseScript({ test: 'vitest', dev: 'vite' })).toBe('dev');
    expect(inferPort('ng serve --port 4300', 4200)).toBe(4300);
    expect(classifyRepository(2, 2, false)).toBe('multi-repo');
    expect(classifyRepository(3, 1, true)).toBe('monorepo');
    expect(runtimeScriptNames({ dev: 'vite', 'db:reset': 'prisma migrate reset', test: 'vitest', api: 'bun server.ts' })).toEqual(['dev', 'api']);
  });

  test('prioritizes real watch commands over one-shot start scripts', () => {
    const nestScripts = { start: 'nest start', 'start:dev': 'nest start --watch' };
    expect(chooseScript(nestScripts)).toBe('start:dev');
    expect(isWatchScript('start:dev', nestScripts['start:dev'])).toBe(true);
    expect(isWatchScript('start', nestScripts.start)).toBe(false);
    expect(isWatchScript('dev', 'tsx server.ts')).toBe(false);
    expect(isWatchScript('dev', 'tsx watch server.ts')).toBe(true);
    expect(isWatchScript('start', 'node --watch server.js')).toBe(true);
    expect(runtimeScriptNames({ dev: 'bun --watch src/server.ts', 'desktop:prepare': 'bun scripts/prepare-desktop.ts' })).toEqual(['dev']);
  });

  test('discovers selectable services from Docker Compose', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'devhubsito-compose-'));
    try {
      await mkdir(path.join(root, 'infra'));
      await mkdir(path.join(root, 'repo-a', '.git'), { recursive: true });
      await mkdir(path.join(root, 'repo-b', '.git'), { recursive: true });
      await writeFile(path.join(root, 'infra', 'compose.yaml'), `services:\n  postgres:\n    image: postgres:17\n    ports:\n      - "5432:5432"\n  worker:\n    image: example/worker:latest\n`);
      const discovery = await discoverProject(root, new Set([4173]), async () => false);
      expect(discovery.packages).toEqual([]);
      expect(discovery.dockerServices).toEqual([expect.objectContaining({
        composeService: 'postgres', composeFile: 'compose.yaml', relativePath: 'infra',
        framework: 'PostgreSQL', suggestedPort: 5432, openable: false,
      })]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('service runtime coordination', () => {
  test('uses the frontend port selected by the Hub for backend CORS', () => {
    const api = { id: 'api', name: 'API', kind: 'process' as const, framework: 'Express', port: 3001 };
    const web = { id: 'web', name: 'Web', kind: 'process' as const, framework: 'Angular', port: 4202 };
    expect(frontendUrlForService(api, [api, web], 'localhost')).toBe('http://localhost:4202');
    expect(frontendUrlForService(web, [api, web], 'localhost')).toBeNull();
  });
});
