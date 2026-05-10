import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const LOG_DIR = path.resolve(process.cwd(), 'storage', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

let writeQueue: Promise<void> = Promise.resolve();

function fmtError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ''}`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * 记录路由级错误：打 console.error + 异步追加到 storage/logs/server.log
 * 写文件失败不抛异常，避免污染主请求路径。
 */
export function logRouteError(scope: string, error: unknown, extra?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${scope}] ${fmtError(error)}${
    extra ? ` extra=${JSON.stringify(extra)}` : ''
  }\n`;

  console.error(`[${scope}]`, error, extra ?? '');

  writeQueue = writeQueue
    .then(() => mkdir(LOG_DIR, { recursive: true }))
    .then(() => appendFile(LOG_FILE, line, 'utf-8'))
    .catch((writeError) => {
      console.error('[logger] failed to write log file:', writeError);
    });
}
