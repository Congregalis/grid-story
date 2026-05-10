import type {
  Book,
  Chapter,
  Character,
  DecisionProfile,
  Drive,
  Outline,
  Relationship,
  WorldVariable,
} from '@grid-story/schema';

/** 所有 Stage 共享的上下文，由 StageShell 一次性查询并向下传递。
 *  扩展时往里加字段即可——computeProgress 是纯函数，不会副作用。 */
export interface StageContext {
  book: Book;
  characters: Character[];
  decisionProfiles: DecisionProfile[];
  drives: Drive[];
  relationships: Relationship[];
  worldVariables: WorldVariable[];
  outlines: Outline[];
  chapters: Chapter[];
}

export type StageId = 'charter' | 'setup' | 'outline' | 'writing' | 'publish';

export interface StageProgress {
  done: boolean;
  /** 未完成时罗列具体阻塞项（鼠标 hover Stepper 节点时通过 title 展示） */
  blockers: string[];
  /** 顶部状态条"推荐下一步"的提示，可空 */
  nextHint: string | null;
  /** 进度比例 0-1，可视化用 */
  ratio: number;
}

export interface StageDef {
  id: StageId;
  label: string;       // "① 立项"
  shortLabel: string;  // "立项"（窄屏 / Stepper 节点用）
  route: string;       // 相对 /books/:bookId/stages/，如 'charter'
  icon: string;        // emoji
  /** 该阶段是否对外暴露专家模式 ⚙ 入口 */
  expertEntry: { label: string; path: string } | null;
  /** 计算该阶段的进度——纯函数 */
  computeProgress(ctx: StageContext): StageProgress;
}
