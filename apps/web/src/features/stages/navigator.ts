import { STAGES } from './definitions';
import type { StageContext, StageId } from './types';

export interface CanEnterResult {
  allowed: boolean;
  reason: string | null;
  /** 当 allowed=false 时指向的最早未完成阶段 */
  blockedBy: StageId | null;
}

/** 是否允许从当前任意位置直接跳到 target 阶段。
 *  规则：
 *   - 后退到任何已完成或之前阶段：允许
 *   - 前进到 target：要求 [0, target-1] 全部 done
 */
export function canEnterStage(target: StageId, ctx: StageContext): CanEnterResult {
  const targetIdx = STAGES.findIndex((s) => s.id === target);
  if (targetIdx < 0) return { allowed: false, reason: '未知阶段', blockedBy: null };

  for (let i = 0; i < targetIdx; i++) {
    const stage = STAGES[i];
    const progress = stage.computeProgress(ctx);
    if (!progress.done) {
      return {
        allowed: false,
        reason: `先完成 ${stage.label}（${progress.blockers.join(' / ')}）`,
        blockedBy: stage.id,
      };
    }
  }
  return { allowed: true, reason: null, blockedBy: null };
}

/** 找到当前应该进入的阶段（首个未完成；都完成则停在 publish）。 */
export function inferActiveStage(ctx: StageContext): StageId {
  for (const stage of STAGES) {
    if (!stage.computeProgress(ctx).done) return stage.id;
  }
  return 'publish';
}

/** 给定当前阶段，找到下一个推荐进入的阶段（用于"推荐下一步"按钮）。 */
export function suggestNextStage(currentId: StageId, ctx: StageContext): StageId | null {
  const currentIdx = STAGES.findIndex((s) => s.id === currentId);
  if (currentIdx < 0) return null;
  for (let i = currentIdx + 1; i < STAGES.length; i++) {
    const stage = STAGES[i];
    if (canEnterStage(stage.id, ctx).allowed) return stage.id;
  }
  return null;
}

/** 当前 URL 阶段是否已完成（用于"已完成可前进"提示）。 */
export function isCurrentStageDone(currentId: StageId, ctx: StageContext): boolean {
  const stage = STAGES.find((s) => s.id === currentId);
  return stage ? stage.computeProgress(ctx).done : false;
}
