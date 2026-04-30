import { useEffect, useState } from 'react';

const KEY = 'grid-story:bookId';
const LISTENERS = new Set<(id: string) => void>();

function read(): string {
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;
  // 首次访问：生成一个稳定的 demo bookId（不依赖 uuid 包，crypto.randomUUID 浏览器自带）
  const fresh = `book_${crypto.randomUUID().slice(0, 8)}`;
  localStorage.setItem(KEY, fresh);
  return fresh;
}

export function useBookId(): [string, (next: string) => void] {
  const [id, setId] = useState(read);

  useEffect(() => {
    const onChange = (next: string) => setId(next);
    LISTENERS.add(onChange);
    return () => {
      LISTENERS.delete(onChange);
    };
  }, []);

  const set = (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) return;
    localStorage.setItem(KEY, trimmed);
    LISTENERS.forEach((fn) => fn(trimmed));
  };

  return [id, set];
}
