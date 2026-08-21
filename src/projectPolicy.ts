import path from 'node:path';

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function resolveAllowedPath(input: string, allowedRoots: string[]): string | null {
  if (!input.trim()) return null;
  const candidates = path.isAbsolute(input)
    ? [path.resolve(input)]
    : allowedRoots.map((root) => path.resolve(root, input));

  for (const candidate of candidates) {
    const allowed = allowedRoots.some((root) => {
      const relative = path.relative(path.resolve(root), candidate);
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    });
    if (allowed) return candidate;
  }
  return null;
}

export function isValidPort(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1024 && Number(value) <= 65535;
}

export function isValidScriptName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,80}$/.test(value);
}

export function normalizeArgs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 200)
    .slice(0, 20);
}
