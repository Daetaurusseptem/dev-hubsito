import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

describe('desktop shutdown lifecycle', () => {
  test('coordinates the native close event with the managed-service shutdown API', async () => {
    const [server, desktop, html] = await Promise.all([
      readFile(new URL('../src/server.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8'),
      readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    ]);

    expect(server).toContain('closeServicesOnExit: true');
    expect(server).toContain("url.pathname === '/api/shutdown'");
    expect(server).toContain('launchedByHub');
    expect(desktop).toContain('api.prevent_close()');
    expect(desktop).toContain('shutdown-requested');
    expect(desktop).toContain('complete_shutdown');
    expect(html).toContain('Cerrando proyectos…');
  });
});
