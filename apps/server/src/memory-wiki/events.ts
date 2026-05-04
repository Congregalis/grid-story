import { EventEmitter } from 'node:events';

export type MemoryWikiBibleEntityType =
  | 'characters'
  | 'locations'
  | 'organizations'
  | 'items'
  | 'concepts';

export interface MemoryWikiBibleEntityEvent {
  action: 'created' | 'updated';
  bookId: string;
  entityType: MemoryWikiBibleEntityType;
  entity: Record<string, unknown>;
}

const bus = new EventEmitter();

export function emitBibleEntityChanged(event: MemoryWikiBibleEntityEvent): void {
  bus.emit('bible.entity.changed', event);
}

export function onBibleEntityChanged(
  listener: (event: MemoryWikiBibleEntityEvent) => Promise<void>,
): () => void {
  const wrapped = (event: MemoryWikiBibleEntityEvent) => {
    void listener(event).catch((error) => {
      console.error('[memory-wiki] bible entity event failed', error);
    });
  };

  bus.on('bible.entity.changed', wrapped);
  return () => bus.off('bible.entity.changed', wrapped);
}
