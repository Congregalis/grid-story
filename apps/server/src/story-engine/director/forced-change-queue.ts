import type { AuthorForcedChange } from '@grid-story/schema';

export class ForcedChangeQueue {
  private readonly pending = new Map<string, AuthorForcedChange[]>();

  record(bookId: string, change: Omit<AuthorForcedChange, 'appliedAt'>) {
    const entry: AuthorForcedChange = { ...change, appliedAt: new Date().toISOString() };
    this.pending.set(bookId, [...(this.pending.get(bookId) ?? []), entry]);
  }

  listPending(bookId: string): AuthorForcedChange[] {
    return this.pending.get(bookId) ?? [];
  }

  clearPending(bookId: string) {
    this.pending.delete(bookId);
  }
}
