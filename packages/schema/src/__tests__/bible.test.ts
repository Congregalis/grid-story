import { describe, expect, it } from 'vitest';
import {
  characterSchema,
  locationSchema,
  organizationSchema,
  itemSchema,
  timelineEventSchema,
  conceptSchema,
  storyBibleSchema,
} from '../index';

const base = {
  id: '00000000-0000-0000-0000-000000000001',
  bookId: '00000000-0000-0000-0000-000000000010',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  notes: null,
};

describe('characterSchema', () => {
  it('accepts valid character', () => {
    const result = characterSchema.safeParse({
      ...base,
      name: '艾琳',
      aliases: ['小艾', '火之魔女'],
      gender: 'female',
      age: '外表16，实际300',
      species: '半精灵',
      appearance: '红色长发，翠绿眼瞳',
      personality: '表面冷漠，内心温柔',
      background: '精灵族与人类的混血后裔',
      motivation: '寻找失散的族人',
      abilities: ['火焰魔法', '治愈术'],
      relationships: [
        { targetId: 'c2', type: 'friend', description: '青梅竹马' },
      ],
      locationId: 'loc-1',
      organizationIds: ['org-1'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid character (missing name)', () => {
    const result = characterSchema.safeParse({ ...base, aliases: [] });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields', () => {
    const result = characterSchema.safeParse({ ...base, name: 'X', aliases: [], extraField: 1 });
    expect(result.success).toBe(false);
  });

  it('notes accepts free-form text', () => {
    const result = characterSchema.safeParse({
      ...base,
      name: 'X',
      aliases: [],
      gender: null,
      age: null,
      species: null,
      appearance: null,
      personality: null,
      background: null,
      motivation: null,
      abilities: [],
      relationships: [],
      locationId: null,
      organizationIds: [],
      notes: '任何自由文本 —— 可以在 notes 中记录任意信息',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.notes).toBe('任何自由文本 —— 可以在 notes 中记录任意信息');
  });
});

describe('locationSchema', () => {
  it('accepts valid location', () => {
    const result = locationSchema.safeParse({
      ...base,
      name: '浮空城·艾瑟琳',
      type: 'city',
      parentId: null,
      description: '漂浮在云海之上的魔法都市',
      atmosphere: '梦幻而宁静',
      significance: '主角的故乡，最终决战地',
    });
    expect(result.success).toBe(true);
  });
});

describe('organizationSchema', () => {
  it('accepts valid organization', () => {
    const result = organizationSchema.safeParse({
      ...base,
      name: '魔法师协会',
      type: 'guild',
      description: '管理全大陆魔法师的官方组织',
      leaderId: 'c1',
      memberIds: ['c1', 'c2', 'c3'],
      goals: '维护魔法世界的平衡',
      structure: '会长 → 四大长老 → 各分会',
      locationId: 'loc-1',
    });
    expect(result.success).toBe(true);
  });
});

describe('itemSchema', () => {
  it('accepts valid item', () => {
    const result = itemSchema.safeParse({
      ...base,
      name: '烈焰之心',
      type: 'artifact',
      description: '蕴含上古火元素精华的宝石',
      ownerId: 'c1',
      origin: '远古火龙的遗物',
      abilities: ['火焰增幅', '浴火重生'],
      significance: '主角觉醒的关键道具',
    });
    expect(result.success).toBe(true);
  });
});

describe('timelineEventSchema', () => {
  it('accepts valid event', () => {
    const result = timelineEventSchema.safeParse({
      ...base,
      title: '艾琳觉醒火焰之力',
      description: '在生死关头，体内半精灵血脉觉醒',
      timestamp: '第3章',
      order: 5,
      relatedCharacterIds: ['c1', 'c2'],
      relatedLocationIds: ['loc-2'],
      causeEventIds: [],
      effectEventIds: [],
    });
    expect(result.success).toBe(true);
  });
});

describe('conceptSchema', () => {
  it('accepts valid concept', () => {
    const result = conceptSchema.safeParse({
      ...base,
      name: '魔力共鸣法则',
      category: 'magic_system',
      description: '同属性魔力之间会产生共鸣，增幅效果',
      rules: '共鸣强度与距离成反比，同属性×2，相克属性×0.5',
      examples: '火魔法师团队作战时，每人火焰威力提升50%',
    });
    expect(result.success).toBe(true);
  });
});

describe('storyBibleSchema', () => {
  it('accepts a full bible', () => {
    const char = { ...base, name: 'X', aliases: [], gender: null, age: null, species: null, appearance: null, personality: null, background: null, motivation: null, abilities: [], relationships: [], locationId: null, organizationIds: [] };
    const loc = { ...base, name: 'X', type: 'city', parentId: null, description: null, atmosphere: null, significance: null };
    const org = { ...base, name: 'X', type: 'guild', description: null, leaderId: null, memberIds: [], goals: null, structure: null, locationId: null };
    const item = { ...base, name: 'X', type: 'artifact', description: null, ownerId: null, origin: null, abilities: [], significance: null };
    const evt = { ...base, title: 'X', description: null, timestamp: null, order: 1, relatedCharacterIds: [], relatedLocationIds: [], causeEventIds: [], effectEventIds: [] };
    const cpt = { ...base, name: 'X', category: 'magic_system', description: null, rules: null, examples: null };

    const result = storyBibleSchema.safeParse({
      characters: [char],
      locations: [loc],
      organizations: [org],
      items: [item],
      timelineEvents: [evt],
      concepts: [cpt],
    });
    expect(result.success).toBe(true);
  });
});
