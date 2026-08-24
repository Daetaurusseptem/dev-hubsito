export type RuntimeService = {
  id: string;
  name: string;
  kind: 'process' | 'docker-compose';
  framework?: string;
  openable?: boolean;
  port: number;
};

export function frontendUrlForService(service: RuntimeService, services: RuntimeService[], host: string): string | null {
  const frontend = services.find((candidate) => candidate.id !== service.id
    && candidate.kind === 'process'
    && candidate.openable !== false
    && /(angular|react|vue|vite|svelte|astro|next|nuxt|frontend|\bweb\b)/i.test(`${candidate.framework || ''} ${candidate.name}`));
  return frontend ? `http://${host}:${frontend.port}` : null;
}
