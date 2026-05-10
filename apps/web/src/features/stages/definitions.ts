import type { StageContext, StageDef } from './types';

export const CHARTER_STAGE: StageDef = {
  id: 'charter',
  label: '① 立项',
  shortLabel: '立项',
  route: 'charter',
  icon: '📋',
  expertEntry: null,
  computeProgress(ctx) {
    const blockers: string[] = [];
    if (!ctx.book.title?.trim()) blockers.push('书名');
    if (!ctx.book.genre?.trim()) blockers.push('类型');
    if (!ctx.book.hook?.trim()) blockers.push('一句话故事钩子');
    const filled = 3 - blockers.length;
    return {
      done: blockers.length === 0,
      blockers,
      nextHint: blockers.length > 0 ? `还差：${blockers.join(' / ')}` : null,
      ratio: filled / 3,
    };
  },
};

export const SETUP_STAGE: StageDef = {
  id: 'setup',
  label: '② 设定',
  shortLabel: '设定',
  route: 'setup',
  icon: '🎭',
  expertEntry: { label: '完整设定库 ⚙', path: 'expert/bible' },
  computeProgress(ctx) {
    const blockers: string[] = [];
    const isSimulation = ctx.book.engineMode === 'simulation';

    if (ctx.characters.length === 0) blockers.push('至少 1 个角色');
    const protagonists = ctx.characters.filter((c) => c.isProtagonist);
    if (protagonists.length === 0) {
      blockers.push('至少 1 位主角（角色卡勾选 isProtagonist）');
    }

    if (isSimulation && protagonists.length > 0) {
      for (const p of protagonists) {
        if (!ctx.decisionProfiles.some((dp) => dp.characterId === p.id)) {
          blockers.push(`${p.name} 还没决策画像`);
        }
        if (!ctx.drives.some((d) => d.characterId === p.id)) {
          blockers.push(`${p.name} 还没 Drive`);
        }
      }
    }

    // 关系 / 世界变量是软建议，不进硬门槛
    const totalChecks = isSimulation ? Math.max(2 + protagonists.length * 2, 2) : 2;
    const filled = Math.max(0, totalChecks - blockers.length);
    return {
      done: blockers.length === 0,
      blockers,
      nextHint: blockers.length > 0 ? `还差：${blockers[0]}` : null,
      ratio: blockers.length === 0 ? 1 : filled / totalChecks,
    };
  },
};

export const OUTLINE_STAGE: StageDef = {
  id: 'outline',
  label: '③ 大纲',
  shortLabel: '大纲',
  route: 'outline',
  icon: '🗺️',
  expertEntry: null,
  computeProgress(ctx) {
    const arcs = ctx.outlines.filter((o) => o.type === 'arc').length;
    const chapters = ctx.outlines.filter((o) => o.type === 'chapter').length;
    const blockers: string[] = [];
    if (arcs === 0) blockers.push('至少 1 个 arc');
    if (chapters === 0) blockers.push('至少 1 个 chapter（大纲层级）');
    return {
      done: blockers.length === 0,
      blockers,
      nextHint: blockers.length > 0 ? `还差：${blockers.join(' / ')}` : null,
      ratio: blockers.length === 0 ? 1 : (2 - blockers.length) / 2,
    };
  },
};

export const WRITING_STAGE: StageDef = {
  id: 'writing',
  label: '④ 写作',
  shortLabel: '写作',
  route: 'writing',
  icon: '✍️',
  expertEntry: { label: '专家写作台 ⚙', path: 'expert/writing' },
  computeProgress(ctx) {
    const finalized = ctx.chapters.filter((c) => c.status === 'final').length;
    const drafted = ctx.chapters.length;
    const blockers: string[] = [];
    if (drafted === 0) blockers.push('开始写第一章');
    if (drafted > 0 && finalized === 0) {
      blockers.push(`finalize 至少 1 章（当前 ${drafted} 章草稿）`);
    }
    const nextHint =
      finalized > 0
        ? `已完成 ${finalized} 章 · 可前往 ⑤ 出版`
        : drafted > 0
          ? '写完后把章节状态改为 final 即可'
          : '在左侧章节列表点 + 创建第一章';
    return {
      done: finalized > 0,
      blockers,
      nextHint,
      ratio: finalized > 0 ? 1 : drafted > 0 ? 0.5 : 0,
    };
  },
};

export const PUBLISH_STAGE: StageDef = {
  id: 'publish',
  label: '⑤ 出版',
  shortLabel: '出版',
  route: 'publish',
  icon: '📦',
  expertEntry: null,
  computeProgress(ctx) {
    const finalized = ctx.chapters.filter((c) => c.status === 'final').length;
    return {
      done: false, // 出版阶段没有终态，永远 in-progress
      blockers: finalized === 0 ? ['先去 ④ 写作 finalize 至少 1 章'] : [],
      nextHint: finalized > 0 ? `${finalized} 章已 finalize · 可导出 / 浏览 wiki` : null,
      ratio: finalized > 0 ? 1 : 0,
    };
  },
};

export const STAGES: StageDef[] = [
  CHARTER_STAGE,
  SETUP_STAGE,
  OUTLINE_STAGE,
  WRITING_STAGE,
  PUBLISH_STAGE,
];

export function findStage(id: string): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}

export function isStageId(id: string | undefined): id is StageContext['book']['engineMode'] | string {
  return typeof id === 'string' && STAGES.some((s) => s.id === id);
}
