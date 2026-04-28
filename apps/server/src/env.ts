import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env from repo root. Existing env vars take precedence.
const envPath = resolve(import.meta.dirname, '../../../.env');
try {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#\s][^=]*?)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] ??= m[2].trim();
  }
} catch { /* .env file is optional */ }
