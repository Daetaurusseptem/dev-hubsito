import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dir, '..');
const binaries = path.join(root, 'src-tauri', 'binaries');
const target = process.platform === 'win32' ? 'x86_64-pc-windows-msvc.exe' : process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-unknown-linux-gnu';
const output = path.join(binaries, `devhubsito-server-${target}`);
await mkdir(binaries, { recursive: true });

async function run(command: string[]) {
  const process = Bun.spawn(command, { cwd: root, stdout: 'inherit', stderr: 'inherit', stdin: 'inherit' });
  const code = await process.exited;
  if (code !== 0) throw new Error(`${command.join(' ')} terminó con código ${code}`);
}

console.log('→ Compilando el servidor autónomo…');
await run([process.execPath, 'build', 'src/server.ts', '--compile', '--outfile', output]);
console.log('→ Generando iconos de Windows…');
await run([process.execPath, 'x', 'tauri', 'icon', 'public/devhubsito.svg']);
console.log(`✓ Sidecar listo: ${path.relative(root, output)}`);

