import { z } from 'zod';

export const reviewDimension = z.enum([
  'ooc',
  'canon_conflict',
  'timeline',
  'foreshadowing',
  'character_hijack',
]);
export type ReviewDimension = z.infer<typeof reviewDimension>;

export const reviewSeverity = z.enum(['critical', 'major', 'minor', 'note']);
export type ReviewSeverity = z.infer<typeof reviewSeverity>;

export const reviewIssueSchema = z.object({
  dimension: reviewDimension,
  severity: reviewSeverity,
  quote: z.string().optional(),
  comment: z.string(),
  suggestion: z.string().optional(),
});
export type ReviewIssue = z.infer<typeof reviewIssueSchema>;

export const reviewResultSchema = z.object({
  issues: z.array(reviewIssueSchema),
});
export type ReviewResult = z.infer<typeof reviewResultSchema>;
