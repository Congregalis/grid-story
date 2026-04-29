import { jsonb, pgTable, text, integer } from 'drizzle-orm/pg-core';

// -- Character --
export const characters = pgTable('character', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  name: text('name').notNull(),
  aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
  gender: text('gender'),
  age: text('age'),
  species: text('species'),
  appearance: text('appearance'),
  personality: text('personality'),
  background: text('background'),
  motivation: text('motivation'),
  abilities: jsonb('abilities').$type<string[]>().notNull().default([]),
  relationships: jsonb('relationships').$type<{ targetId: string; type: string; description: string }[]>().notNull().default([]),
  locationId: text('location_id'),
  organizationIds: jsonb('organization_ids').$type<string[]>().notNull().default([]),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// -- Location --
export const locations = pgTable('location', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  parentId: text('parent_id'),
  description: text('description'),
  atmosphere: text('atmosphere'),
  significance: text('significance'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// -- Organization --
export const organizations = pgTable('organization', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  description: text('description'),
  leaderId: text('leader_id'),
  memberIds: jsonb('member_ids').$type<string[]>().notNull().default([]),
  goals: text('goals'),
  structure: text('structure'),
  locationId: text('location_id'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// -- Item --
export const items = pgTable('item', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  description: text('description'),
  ownerId: text('owner_id'),
  origin: text('origin'),
  abilities: jsonb('abilities').$type<string[]>().notNull().default([]),
  significance: text('significance'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// -- Timeline event --
export const timelineEvents = pgTable('timeline_event', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  timestamp: text('timestamp'),
  order: integer('order').notNull(),
  relatedCharacterIds: jsonb('related_character_ids').$type<string[]>().notNull().default([]),
  relatedLocationIds: jsonb('related_location_ids').$type<string[]>().notNull().default([]),
  causeEventIds: jsonb('cause_event_ids').$type<string[]>().notNull().default([]),
  effectEventIds: jsonb('effect_event_ids').$type<string[]>().notNull().default([]),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// -- Outline --
export const outlines = pgTable('outline', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  parentId: text('parent_id'),
  order: integer('order').notNull(),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// -- Concept --
export const concepts = pgTable('concept', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  rules: text('rules'),
  examples: text('examples'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
