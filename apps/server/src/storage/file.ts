import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.env.STORAGE_ROOT || './storage');

async function ensureRoot() {
  await fs.mkdir(ROOT, { recursive: true });
}

export async function writeFile(key: string, content: string | Buffer): Promise<string> {
  await ensureRoot();
  const filePath = path.join(ROOT, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return filePath;
}

export async function readFile(key: string): Promise<string> {
  const filePath = path.join(ROOT, key);
  return fs.readFile(filePath, 'utf-8');
}

export async function deleteFile(key: string): Promise<void> {
  const filePath = path.join(ROOT, key);
  await fs.unlink(filePath).catch(() => {}); // ignore if missing
}
