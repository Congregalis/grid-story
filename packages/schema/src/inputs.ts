import { z } from 'zod';
import { characterSchema } from './character';
import { locationSchema } from './location';
import { organizationSchema } from './organization';
import { itemSchema } from './item';
import { timelineEventSchema } from './timeline';
import { conceptSchema } from './concept';

// Input schemas omit server-managed fields (id, createdAt, updatedAt).
// bookId and notes are still required — they come from the client context.

export const createCharacterInput = characterSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateCharacterInput = characterSchema.partial().omit({ id: true, createdAt: true, updatedAt: true });

export const createLocationInput = locationSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateLocationInput = locationSchema.partial().omit({ id: true, createdAt: true, updatedAt: true });

export const createOrganizationInput = organizationSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateOrganizationInput = organizationSchema.partial().omit({ id: true, createdAt: true, updatedAt: true });

export const createItemInput = itemSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateItemInput = itemSchema.partial().omit({ id: true, createdAt: true, updatedAt: true });

export const createTimelineEventInput = timelineEventSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateTimelineEventInput = timelineEventSchema.partial().omit({ id: true, createdAt: true, updatedAt: true });

export const createConceptInput = conceptSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateConceptInput = conceptSchema.partial().omit({ id: true, createdAt: true, updatedAt: true });

export type CreateCharacterInput = z.infer<typeof createCharacterInput>;
export type UpdateCharacterInput = z.infer<typeof updateCharacterInput>;
