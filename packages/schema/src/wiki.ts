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
  'lint-report',
  'index',
  'log',
]);

export const wikiConfidence = z.enum(['explicit', 'implied', 'inferred']);

export const wikiQueryCategory = z.enum([
  'characters',
  'locations',
  'organizations',
  'items',
  'concepts',
  'chapters',
  'tracking',
]);

export const wikiFrontmatterSchema = z
  .object({
    page_type: wikiPageType,
    slug: z.string().min(1),
    updated_at: z.string().datetime(),
  })
  .passthrough();

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

export const wikiQueryContextSchema = z
  .object({
    task: z.string().min(1).optional(),
    chapter_id: z.string().min(1).optional(),
    chapter_number: z.number().int().positive().optional(),
    chapter_title: z.string().min(1).optional(),
    scene_brief: z.string().optional(),
    direction: z.string().optional(),
    selected_text: z.string().optional(),
    chapter_content: z.string().optional(),
    characters: z.array(z.string().min(1)).default([]),
    locations: z.array(z.string().min(1)).default([]),
    concepts: z.array(z.string().min(1)).default([]),
    recentChapters: z.number().int().positive().max(20).default(3),
    keyScenes: z.array(z.union([z.number().int().positive(), z.string().min(1)])).default([]),
    maxPages: z.number().int().positive().max(30).default(15),
    maxSamples: z.number().int().positive().max(20).default(8),
    maxCharsPerSample: z.number().int().positive().max(4000).default(1200),
    tokenBudget: z.number().int().positive().max(32_000).default(8_000),
  })
  .passthrough();

export const queryCategorySelectionSchema = z.object({
  categories: z.array(wikiQueryCategory).min(1).max(7),
  reason: z.string().optional(),
});

export const selectedWikiPageSchema = z.object({
  path: z.string().min(1),
  category: wikiQueryCategory.optional(),
  reason: z.string().optional(),
});

export const queryPageSelectionSchema = z.object({
  pages: z.array(selectedWikiPageSchema).max(30),
  reason: z.string().optional(),
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

export const wikiQueryResultSchema = z.object({
  ok: z.literal(true),
  selected_categories: z.array(wikiQueryCategory),
  selected_pages: z.array(selectedWikiPageSchema),
  blocks: contextBlocksSchema,
  assembled_context: z.string(),
  warnings: z.array(z.string()).default([]),
});

export const wikiLintSeverity = z.enum(['critical', 'warning', 'info']);

export const wikiLintIssueSchema = z.object({
  id: z.string().min(1),
  check: z.string().min(1),
  severity: wikiLintSeverity,
  title: z.string().min(1),
  message: z.string().min(1),
  page_path: z.string().min(1).optional(),
  evidence: z.string().optional(),
  suggestion: z.string().optional(),
  source: z.enum(['deterministic', 'llm']).default('deterministic'),
  auto_fixable: z.boolean().default(false),
});

export const wikiLintModelIssueSchema = wikiLintIssueSchema
  .omit({
    id: true,
    check: true,
    source: true,
    auto_fixable: true,
  })
  .extend({
    auto_fixable: z.boolean().optional(),
  });

export const wikiLintModelOutputSchema = z.object({
  issues: z.array(wikiLintModelIssueSchema).default([]),
});

export const wikiLintResultSchema = z.object({
  ok: z.literal(true),
  skipped: z.boolean(),
  reason: z.string().optional(),
  reportPath: z.string().optional(),
  issues: z.array(wikiLintIssueSchema).default([]),
  generatedAt: z.string().datetime(),
  counts: z.object({
    critical: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(),
    info: z.number().int().nonnegative(),
  }),
});

export const wikiLintReportSummarySchema = z.object({
  path: z.string().min(1),
  title: z.string().min(1),
  generatedAt: z.string().datetime().optional(),
  issueCount: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative(),
  warning: z.number().int().nonnegative(),
  info: z.number().int().nonnegative(),
});

export type WikiPageType = z.infer<typeof wikiPageType>;
export type WikiConfidence = z.infer<typeof wikiConfidence>;
export type WikiQueryCategory = z.infer<typeof wikiQueryCategory>;
export type WikiFrontmatter = z.infer<typeof wikiFrontmatterSchema>;
export type WikiFact = z.infer<typeof wikiFactSchema>;
export type WikiEntityUpdate = z.infer<typeof wikiEntityUpdateSchema>;
export type ExtractedInfo = z.infer<typeof extractedInfoSchema>;
export type WikiDivergence = z.infer<typeof wikiDivergenceSchema>;
export type MergeResult = z.infer<typeof mergeResultSchema>;
export type ContextPage = z.infer<typeof contextPageSchema>;
export type ProseSample = z.infer<typeof proseSampleSchema>;
export type WikiQueryContext = z.infer<typeof wikiQueryContextSchema>;
export type QueryCategorySelection = z.infer<typeof queryCategorySelectionSchema>;
export type SelectedWikiPage = z.infer<typeof selectedWikiPageSchema>;
export type QueryPageSelection = z.infer<typeof queryPageSelectionSchema>;
export type ContextBlocks = z.infer<typeof contextBlocksSchema>;
export type WikiQueryResult = z.infer<typeof wikiQueryResultSchema>;
export type WikiLintSeverity = z.infer<typeof wikiLintSeverity>;
export type WikiLintIssue = z.infer<typeof wikiLintIssueSchema>;
export type WikiLintModelOutput = z.infer<typeof wikiLintModelOutputSchema>;
export type WikiLintResult = z.infer<typeof wikiLintResultSchema>;
export type WikiLintReportSummary = z.infer<typeof wikiLintReportSummarySchema>;
