import { z } from 'zod';

export const wikiPageType = z.enum([
  'character',
  'location',
  'organization',
  'item',
  'concept',
  'chapter-summary',
  'volume-summary',
  'global-state',
  'timeline',
  'foreshadowing',
  'loose-threads',
  'divergences',
  'redirects',
  'index',
  'log',
]);

export const wikiConfidence = z.enum(['explicit', 'implied', 'inferred']);

export const wikiFrontmatterSchema = z.object({
  page_type: wikiPageType,
  slug: z.string().min(1),
  updated_at: z.string().datetime(),
}).passthrough();

export const wikiFactSchema = z.object({
  text: z.string().min(1),
  confidence: wikiConfidence,
  source_chapter: z.number().int().positive().optional(),
  evidence: z.string().optional(),
});

export const wikiEntityUpdateSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).optional(),
  bible_entity_id: z.string().nullable().optional(),
  facts: z.array(wikiFactSchema).default([]),
});

export const wikiTimelineEventSchema = z.object({
  chapter_number: z.number().int().positive(),
  story_date: z.string().nullable().optional(),
  event: z.string().min(1),
  characters: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  confidence: wikiConfidence,
  evidence: z.string().optional(),
});

export const wikiForeshadowingPlantedSchema = z.object({
  description: z.string().min(1),
  planted_chapter: z.number().int().positive(),
  expected_payoff_chapter: z.number().int().positive().nullable().optional(),
  confidence: wikiConfidence,
  evidence: z.string().optional(),
});

export const wikiForeshadowingPaidOffSchema = z.object({
  description: z.string().min(1),
  planted_chapter: z.number().int().positive().nullable().optional(),
  paid_off_chapter: z.number().int().positive(),
  confidence: wikiConfidence,
  evidence: z.string().optional(),
});

export const wikiLooseThreadSchema = z.object({
  description: z.string().min(1),
  status: z.enum(['opened', 'resolved']).default('opened'),
  chapter_number: z.number().int().positive(),
  confidence: wikiConfidence,
  evidence: z.string().optional(),
});

export const extractedInfoSchema = z.object({
  chapter_id: z.string().min(1),
  chapter_number: z.number().int().positive(),
  chapter_title: z.string().optional(),
  summary: z.string().min(1),
  character_updates: z.array(wikiEntityUpdateSchema).default([]),
  location_updates: z.array(wikiEntityUpdateSchema).default([]),
  organization_updates: z.array(wikiEntityUpdateSchema).default([]),
  item_updates: z.array(wikiEntityUpdateSchema).default([]),
  concept_updates: z.array(wikiEntityUpdateSchema).default([]),
  timeline_events: z.array(wikiTimelineEventSchema).default([]),
  foreshadowing_planted: z.array(wikiForeshadowingPlantedSchema).default([]),
  foreshadowing_paid_off: z.array(wikiForeshadowingPaidOffSchema).default([]),
  loose_threads: z.array(wikiLooseThreadSchema).default([]),
});

export const wikiDivergenceSchema = z.object({
  id: z.string().optional(),
  page_path: z.string().min(1),
  kind: z.enum(['bible_conflict', 'wiki_conflict', 'new_observation']),
  old_observation: z.string().optional(),
  new_observation: z.string().min(1),
  bible_value: z.string().optional(),
  evidence: z.string().optional(),
  suggestion: z.string().optional(),
});

export const mergeResultSchema = z.object({
  merged_page: z.string().min(1),
  divergences: z.array(wikiDivergenceSchema).default([]),
});

export const contextPageSchema = z.object({
  path: z.string().min(1),
  title: z.string().optional(),
  content: z.string().min(1),
});

export const proseSampleSchema = z.object({
  chapter_id: z.string().min(1),
  chapter_number: z.number().int().positive(),
  title: z.string().min(1),
  span: z.string().optional(),
  text: z.string().min(1),
});

export const contextBlocksSchema = z.object({
  wiki: z.object({
    characters: z.array(contextPageSchema).default([]),
    locations: z.array(contextPageSchema).default([]),
    organizations: z.array(contextPageSchema).default([]),
    items: z.array(contextPageSchema).default([]),
    concepts: z.array(contextPageSchema).default([]),
    recent_summaries: z.array(contextPageSchema).default([]),
    global_state: contextPageSchema.nullable().default(null),
    loose_threads: z.array(contextPageSchema).default([]),
  }),
  prose: z.array(proseSampleSchema).default([]),
  divergences: z.array(wikiDivergenceSchema).default([]),
});

export type WikiPageType = z.infer<typeof wikiPageType>;
export type WikiConfidence = z.infer<typeof wikiConfidence>;
export type WikiFrontmatter = z.infer<typeof wikiFrontmatterSchema>;
export type WikiFact = z.infer<typeof wikiFactSchema>;
export type WikiEntityUpdate = z.infer<typeof wikiEntityUpdateSchema>;
export type ExtractedInfo = z.infer<typeof extractedInfoSchema>;
export type WikiDivergence = z.infer<typeof wikiDivergenceSchema>;
export type MergeResult = z.infer<typeof mergeResultSchema>;
export type ContextPage = z.infer<typeof contextPageSchema>;
export type ProseSample = z.infer<typeof proseSampleSchema>;
export type ContextBlocks = z.infer<typeof contextBlocksSchema>;
