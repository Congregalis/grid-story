import { customType, pgTable, serial, text } from 'drizzle-orm/pg-core';

// pgvector halfvec(1536) type — Drizzle doesn't ship a native pgvector type,
// so we define a custom one that maps to the SQL vector type.
const vector = customType<{
  data: number[];
  driverData: string;
}>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(val: number[]): string {
    return `[${val.join(',')}]`;
  },
  fromDriver(val: string): number[] {
    return val.slice(1, -1).split(',').map(Number);
  },
});

export const testDoc = pgTable('test_doc', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
});

export const testVector = pgTable('test_vector', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  embedding: vector('embedding').notNull(),
});

export * from './book-tables';
export * from './bible-tables';
