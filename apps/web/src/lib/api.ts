export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API ${status}`);
  }
}

export function formatApiError(error: unknown, userMessage = '操作失败，请稍后重试'): string {
  console.warn('[api]', userMessage, error);
  return userMessage;
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // 非 JSON 响应（Hono 404 / 502 网关错误 / etc.）— 保留原文，
      // 不要让 SyntaxError 把真正的状态码盖掉。
      parsed = text;
    }
  }
  if (!res.ok) throw new ApiError(res.status, parsed);
  return parsed as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) => request<T>('POST', path, body ?? {}, signal),
  put: <T>(path: string, body: unknown, signal?: AbortSignal) => request<T>('PUT', path, body, signal),
  del: <T>(path: string, signal?: AbortSignal) => request<T>('DELETE', path, undefined, signal),
};
