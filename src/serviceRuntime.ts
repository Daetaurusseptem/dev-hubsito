export type RuntimeService = {
  id: string;
  name: string;
  kind: 'process' | 'docker-compose';
  framework?: string;
  openable?: boolean;
  port: number;
};

export type RuntimeStatus = 'starting' | 'running' | 'external' | 'stopped' | 'failed' | 'unresponsive';

export function runtimeStatusForProcess(input: {
  portOpen: boolean;
  tracked: boolean;
  exitCode: number | null;
  startedAt?: string | null;
  now?: number;
  startupTimeoutMs?: number;
}): RuntimeStatus {
  if (input.portOpen) return input.tracked ? 'running' : 'external';
  if (!input.tracked) return 'stopped';
  if (input.exitCode !== null) return 'failed';
  const startedAt = input.startedAt ? Date.parse(input.startedAt) : Number.NaN;
  const elapsed = Number.isFinite(startedAt) ? (input.now ?? Date.now()) - startedAt : 0;
  return elapsed >= (input.startupTimeoutMs ?? 60_000) ? 'unresponsive' : 'starting';
}

export function frontendUrlForService(service: RuntimeService, services: RuntimeService[], host: string): string | null {
  const frontend = services.find((candidate) => candidate.id !== service.id
    && candidate.kind === 'process'
    && candidate.openable !== false
    && /(angular|react|vue|vite|svelte|astro|next|nuxt|frontend|\bweb\b)/i.test(`${candidate.framework || ''} ${candidate.name}`));
  return frontend ? `http://${host}:${frontend.port}` : null;
}
