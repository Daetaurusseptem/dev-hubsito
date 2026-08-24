import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

describe('Windows installer lifecycle', () => {
  test('stops only DevHubsito-owned processes before install and uninstall', async () => {
    const hooks = await readFile(new URL('../src-tauri/installer-hooks.nsh', import.meta.url), 'utf8');

    expect(hooks).toContain('NSIS_HOOK_PREINSTALL');
    expect(hooks).toContain('NSIS_HOOK_PREUNINSTALL');
    expect(hooks).toContain('/IM devhubsito.exe');
    expect(hooks).toContain('/IM devhubsito-server.exe');
    expect(hooks).not.toContain('/IM bun.exe');
    expect(hooks).not.toContain('/IM docker.exe');
  });
});
