import { integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

export const books = pgTable('books', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  author: text('author').notNull(),
  genre: text('genre').notNull(),
  style: text('style').notNull(),
  targetWordCount: integer('target_word_count'),
  status: text('status').notNull(),
  worldview: text('worldview'),
  era: text('era'),
  themes: jsonb('themes').$type<string[]>().notNull().default([]),
  hook: text('hook'),
  pov: text('pov'),
  tone: text('tone'),
  rules: jsonb('rules').$type<string[]>().notNull().default([]),
  avoid: jsonb('avoid').$type<string[]>().notNull().default([]),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
