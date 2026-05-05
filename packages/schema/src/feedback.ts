import { z } from 'zod';

export const feedbackAction = z.enum(['accepted', 'rejected', 'edited']);
export type FeedbackAction = z.infer<typeof feedbackAction>;

export const feedbackTargetType = z.enum([
  'writing-draft',
  'writing-rewrite',
  'writing-review',
  'bible-suggestion',
]);
export type FeedbackTargetType = z.infer<typeof feedbackTargetType>;

export const feedbackRecordSchema = z
  .object({
    id: z.string(),
    bookId: z.string(),
    chapterRootId: z.string().nullable(),
    chapterVersionId: z.string().nullable(),
    source: z.string(),
    action: feedbackAction,
    targetType: feedbackTargetType,
    targetId: z.string().nullable(),
    originalContent: z.string().nullable(),
    finalContent: z.string().nullable(),
    metadata: z.record(z.unknown()),
    createdAt: z.string(),
  })
  .strict();
export type FeedbackRecord = z.infer<typeof feedbackRecordSchema>;

export const createFeedbackRecordInput = feedbackRecordSchema.omit({
  id: true,
  createdAt: true,
});
export type CreateFeedbackRecordInput = z.infer<typeof createFeedbackRecordInput>;
