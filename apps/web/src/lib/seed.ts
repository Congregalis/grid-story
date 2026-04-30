import { api } from './api';
import type { Character, Outline, Chapter } from '@grid-story/schema';

export interface SeedResult {
  bookId: string;
  characterId: string;
  outlineNodeIds: string[];
  chapterRootId: string;
}

/**
 * 给空的 bookId 灌一组例子数据，方便首次访问就能演示 MVP 流。
 * 不保证幂等 —— 重复调用会重复建。Home 页通过观测当前 bookId
 * 是否已有数据来判断是否禁用按钮。
 */
export async function seedDemoData(bookId: string): Promise<SeedResult> {
  // 1) 角色
  const character = await api.post<Character>('/bible/characters', {
    bookId,
    name: '林听雪',
    aliases: ['听雪'],
    gender: 'female',
    age: '二十一',
    species: '人类',
    appearance: '玄衣束腰，发上斜插一支冷玉钗。眼神比她说话的语气要冷。',
    personality: '寡言但记性好，认人胜过认事。',
    background: '北境雪原走出的孤女，靠望气与一柄断剑活到现在。',
    motivation: '找出十年前那场雪夜中失踪的师父。',
    abilities: ['望气', '剑术', '辨毒'],
    relationships: [],
    locationId: null,
    organizationIds: [],
    notes: null,
  });

  // 2) Outline 四层（arc → volume → chapter → 2 scenes）
  const arc = await api.post<Outline>('/bible/outlines', {
    bookId,
    type: 'arc',
    title: '第一卷·雪夜回声',
    summary: '主角林听雪从北境出发，追查十年前的师父失踪案。',
    parentId: null,
    order: 0,
    notes: null,
  });
  const volume = await api.post<Outline>('/bible/outlines', {
    bookId,
    type: 'volume',
    title: '上部·城门下',
    summary: '抵达雪夜城，与守将的第一次交锋。',
    parentId: arc.id,
    order: 0,
    notes: null,
  });
  const chapter = await api.post<Outline>('/bible/outlines', {
    bookId,
    type: 'chapter',
    title: '第一章·雪夜抵城',
    summary: '听雪在风雪中抵达城门口，被守将拦下盘问。',
    parentId: volume.id,
    order: 0,
    notes: null,
  });
  const scene1 = await api.post<Outline>('/bible/outlines', {
    bookId,
    type: 'scene',
    title: '场景 1·风雪中的剪影',
    summary: '听雪策马走出风雪，第一次看见雪夜城的城墙。',
    parentId: chapter.id,
    order: 0,
    notes: null,
  });
  const scene2 = await api.post<Outline>('/bible/outlines', {
    bookId,
    type: 'scene',
    title: '场景 2·守将的拦问',
    summary: '城门口被守将拦下，递出师父留下的玉钗作为凭证。',
    parentId: chapter.id,
    order: 1,
    notes: null,
  });

  // 3) 空章节行（让 Writing Desk 直接有东西可点）
  const rootId = `chap_${crypto.randomUUID().slice(0, 8)}`;
  await api.post<Chapter>('/bible/chapters', {
    bookId,
    chapterRootId: rootId,
    title: '第一章·雪夜抵城',
    content: '',
    version: 1,
    parentVersionId: null,
    status: 'draft',
    wordCount: 0,
    order: 0,
    notes: null,
  });

  return {
    bookId,
    characterId: character.id,
    outlineNodeIds: [arc.id, volume.id, chapter.id, scene1.id, scene2.id],
    chapterRootId: rootId,
  };
}
