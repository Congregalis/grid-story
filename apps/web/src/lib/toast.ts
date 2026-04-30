import { useEffect, useState } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

let nextId = 1;
const subscribers = new Set<(toasts: Toast[]) => void>();
let store: Toast[] = [];

function publish() {
  for (const s of subscribers) s(store);
}

export const toast = {
  success(message: string) {
    push(message, 'success');
  },
  error(message: string) {
    push(message, 'error');
  },
  info(message: string) {
    push(message, 'info');
  },
};

function push(message: string, variant: ToastVariant) {
  const id = nextId++;
  store = [...store, { id, message, variant }];
  publish();
  // error 停留长一点，给读时间
  const ttl = variant === 'error' ? 6000 : 2500;
  setTimeout(() => {
    store = store.filter((t) => t.id !== id);
    publish();
  }, ttl);
}

export function useToasts(): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>(store);
  useEffect(() => {
    subscribers.add(setToasts);
    return () => {
      subscribers.delete(setToasts);
    };
  }, []);
  return toasts;
}
