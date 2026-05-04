export interface StepStats {
  characters: number;
  outlines: number;
  chapters: number;
  finalChapters: number;
  draftChapters: number;
  reviewChapters: number;
  charterFilled: number;
  charterTotal: number;
  draftChapterTitle?: string;
  reviewChapterTitle?: string;
}

export interface NextStep {
  label: string;
  /** relative path from book root, e.g. "settings" or "writing" */
  to: string;
  urgency: 'idle' | 'action' | 'warning';
}

export function getNextStep(stats: StepStats | undefined): NextStep | null {
  if (!stats) return null;

  if (stats.charterFilled === 0) {
    return { label: '先填创作设定', to: 'settings', urgency: 'warning' };
  }
  if (stats.characters === 0) {
    return { label: '建第一个角色', to: 'bible', urgency: 'action' };
  }
  if (stats.outlines < 4) {
    return { label: '搭大纲', to: 'outline', urgency: 'action' };
  }
  if (stats.chapters === 0) {
    return { label: '新建第一章', to: 'writing', urgency: 'action' };
  }
  if (stats.reviewChapters > 0) {
    if (stats.reviewChapterTitle) {
      return { label: `审定《${stats.reviewChapterTitle}》`, to: 'writing', urgency: 'warning' };
    }
    return { label: '审定章节', to: 'writing', urgency: 'warning' };
  }
  if (stats.draftChapters > 0) {
    if (stats.draftChapterTitle) {
      return { label: `继续写《${stats.draftChapterTitle}》`, to: 'writing', urgency: 'action' };
    }
    return { label: '继续写草稿', to: 'writing', urgency: 'action' };
  }
  if (stats.finalChapters > 0) {
    return { label: '新建下一章', to: 'writing', urgency: 'idle' };
  }

  return { label: '继续创作', to: 'writing', urgency: 'idle' };
}
