import path from 'node:path';

export function normalizeWikiPath(input: string): string {
  const normalized = input.replace(/\\/g, '/').replace(/^\/+/, '');
  const withoutMd = normalized.endsWith('.md') ? normalized.slice(0, -3) : normalized;
  const resolved = path.posix.normalize(withoutMd);

  if (resolved === '.' || resolved.startsWith('../') || resolved === '..' || path.isAbsolute(input)) {
    throw new Error(`Invalid wiki path: ${input}`);
  }

  return `${resolved}.md`;
}

export function normalizeWikiDir(input = ''): string {
  const normalized = input.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return '';

  const resolved = path.posix.normalize(normalized);
  if (resolved === '.' || resolved.startsWith('../') || resolved === '..' || path.isAbsolute(input)) {
    throw new Error(`Invalid wiki dir: ${input}`);
  }

  return resolved;
}

export function stripMarkdownExt(input: string): string {
  return input.endsWith('.md') ? input.slice(0, -3) : input;
}
