import { z } from 'zod';

export const annotationType = z.enum(['comment', 'suggestion', 'correction']);
export const annotationStatus = z.enum(['open', 'resolved', 'rejected']);

export const annotationSchema = z.object({
  id: z.string(),
  chapterId: z.string(),
  type: annotationType,
  // Character offsets in chapter content. null = chapter-level annotation.
  rangeStart: z.number().int().nullable(),
  rangeEnd: z.number().int().nullable(),
  content: z.string(),
  authorId: z.string(),
  status: annotationStatus,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  notes: z.string().nullable(),
}).strict();

export const createAnnotationInput = annotationSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateAnnotationInput = annotationSchema.partial().omit({ id: true, createdAt: true, updatedAt: true });

export type Annotation = z.infer<typeof annotationSchema>;
export type AnnotationType = z.infer<typeof annotationType>;
export type AnnotationStatus = z.infer<typeof annotationStatus>;
export type CreateAnnotationInput = z.infer<typeof createAnnotationInput>;
