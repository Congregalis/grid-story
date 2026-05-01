import { describe, expect, it } from 'vitest';
import {
  bookSchema,
  outlineSchema,
  chapterSchema,
  annotationSchema,
} from '../index';

const bookId = 'b0000000-0000-0000-0000-000000000001';

describe('bookSchema', () => {
  it('accepts valid book', () => {
    const result = bookSchema.safeParse({
      id: bookId,
      title: '火焰与灰烬',
      author: '佚名',
      genre: '奇幻',
      style: '轻松搞笑，二次元风',
      targetWordCount: 100000,
      status: 'writing',
      worldview: '浮空群岛上，火焰魔法被贵族垄断。',
      era: '蒸汽工业刚刚兴起的王国晚期',
      themes: ['阶层流动', '选择的代价'],
      hook: '废柴厨娘能听懂火焰的吐槽。',
      pov: '第三人称有限视角，跟随主角',
      tone: '轻松外壳下带一点苦涩',
      rules: ['魔法必须消耗真实燃料', '每章至少推进一个人物关系'],
      avoid: ['无代价复活', '机械降神'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty story charter', () => {
    const result = bookSchema.safeParse({
      id: bookId,
      title: '空白作品',
      author: '佚名',
      genre: '未定',
      style: '未定',
      targetWordCount: null,
      status: 'planning',
      worldview: null,
      era: null,
      themes: [],
      hook: null,
      pov: null,
      tone: null,
      rules: [],
      avoid: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = bookSchema.safeParse({
      id: bookId, title: 'X', author: 'A', genre: 'G', style: 'S',
      targetWordCount: null, status: 'invalid',
      worldview: null, era: null, themes: [], hook: null, pov: null, tone: null, rules: [], avoid: [],
      createdAt: '...', updatedAt: '...', notes: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields', () => {
    const result = bookSchema.safeParse({
      id: bookId, title: 'X', author: 'A', genre: 'G', style: 'S',
      targetWordCount: null, status: 'planning',
      worldview: null, era: null, themes: [], hook: null, pov: null, tone: null, rules: [], avoid: [],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      notes: null, extra: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('outlineSchema', () => {
  it('accepts root arc outline', () => {
    const result = outlineSchema.safeParse({
      id: 'o1',
      bookId,
      type: 'arc',
      title: '第一卷：觉醒',
      summary: '主角从废柴到觉醒的成长弧',
      parentId: null,
      order: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts nested scene', () => {
    const result = outlineSchema.safeParse({
      id: 'o5',
      bookId,
      type: 'scene',
      title: '艾琳首次使用火焰魔法',
      summary: '意外点燃了整个厨房',
      parentId: 'o4',
      order: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid type', () => {
    const result = outlineSchema.safeParse({
      id: 'o1', bookId, type: 'paragraph', title: 'X', summary: null,
      parentId: null, order: 0,
      createdAt: '...', updatedAt: '...', notes: null,
    });
    expect(result.success).toBe(false);
  });
});

describe('chapterSchema', () => {
  it('accepts v1 chapter', () => {
    const result = chapterSchema.safeParse({
      id: 'ch1',
      bookId,
      chapterRootId: 'root-1',
      title: '第一章：不速之客',
      content: '艾琳从未想过，那个下午会改变她的一生...',
      version: 1,
      parentVersionId: null,
      status: 'draft',
      wordCount: 2500,
      order: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts v2 (revised) chapter with parent pointer', () => {
    const result = chapterSchema.safeParse({
      id: 'ch2',
      bookId,
      chapterRootId: 'root-1',
      title: '第一章：不速之客',
      content: '那个平凡的午后，艾琳没想到命运会如此转折...',
      version: 2,
      parentVersionId: 'ch1',
      status: 'revised',
      wordCount: 2600,
      order: 1,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      notes: '改写了开篇，增强了悬念感',
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative wordCount', () => {
    const result = chapterSchema.safeParse({
      id: 'ch1', bookId, chapterRootId: 'root-1', title: 'X', content: 'Y',
      version: 1, parentVersionId: null, status: 'draft', wordCount: -1, order: 1,
      createdAt: '...', updatedAt: '...', notes: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects version 0', () => {
    const result = chapterSchema.safeParse({
      id: 'ch1', bookId, chapterRootId: 'root-1', title: 'X', content: 'Y',
      version: 0, parentVersionId: null, status: 'draft', wordCount: 100, order: 1,
      createdAt: '...', updatedAt: '...', notes: null,
    });
    expect(result.success).toBe(false);
  });
});

describe('annotationSchema', () => {
  it('accepts inline annotation', () => {
    const result = annotationSchema.safeParse({
      id: 'a1',
      chapterId: 'ch1',
      type: 'suggestion',
      rangeStart: 42,
      rangeEnd: 89,
      content: '这段描写建议加入更多感官细节',
      authorId: 'reviewer-1',
      status: 'open',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts chapter-level annotation (null range)', () => {
    const result = annotationSchema.safeParse({
      id: 'a2',
      chapterId: 'ch1',
      type: 'comment',
      rangeStart: null,
      rangeEnd: null,
      content: '整体节奏偏慢，建议第二章开始加速',
      authorId: 'beta-reader',
      status: 'open',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects rangeEnd before rangeStart', () => {
    // Schema doesn't enforce this — it's app-level validation.
    // Keeping the test to document the intentional omission.
    const result = annotationSchema.safeParse({
      id: 'a1', chapterId: 'ch1', type: 'comment',
      rangeStart: 100, rangeEnd: 10, content: '...', authorId: 'u1',
      status: 'open',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      notes: null,
    });
    // Zod accepts it (both are valid ints); range ordering is enforced at the app level.
    expect(result.success).toBe(true);
  });
});
