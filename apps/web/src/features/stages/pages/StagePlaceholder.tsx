import type { StageContext, StageId } from '../types';
import { findStage } from '../definitions';

interface StagePlaceholderProps {
  ctx: StageContext;
  bookId: string;
  stageId: StageId;
}

/** 占位组件：在各阶段实际页面（#17-#21）实现前用于跑通架构。 */
export function StagePlaceholder({ ctx, bookId, stageId }: StagePlaceholderProps) {
  const stage = findStage(stageId);
  if (!stage) return null;
  const progress = stage.computeProgress(ctx);
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <header>
        <h1 className="font-pixel text-pixel-lg mb-1">
          {stage.icon} {stage.label}
        </h1>
        <p className="font-ui text-sm text-ink-soft">
          该阶段实际内容尚未实现（#{stageOrder(stageId)}）。本占位页用于验证 StageShell
          架构。
        </p>
      </header>

      <section className="border-2 border-outline-soft rounded-md bg-surface-raised p-4 space-y-2">
        <div className="font-pixel text-pixel-sm text-ink-soft">完成度调试</div>
        <ul className="font-ui text-xs text-ink space-y-1">
          <li>
            done: <span className="font-mono">{String(progress.done)}</span>
          </li>
          <li>
            ratio:{' '}
            <span className="font-mono">{(progress.ratio * 100).toFixed(0)}%</span>
          </li>
          <li>
            blockers:{' '}
            <span className="font-mono">
              {progress.blockers.length > 0 ? progress.blockers.join('；') : '（无）'}
            </span>
          </li>
          <li>
            nextHint: <span className="font-mono">{progress.nextHint ?? '（无）'}</span>
          </li>
        </ul>
      </section>

      <section className="border-2 border-outline-soft rounded-md bg-surface-raised p-4 space-y-2">
        <div className="font-pixel text-pixel-sm text-ink-soft">StageContext 摘要</div>
        <ul className="font-ui text-xs text-ink-soft space-y-0.5">
          <li>book.id = {ctx.book.id}</li>
          <li>characters = {ctx.characters.length}</li>
          <li>
            protagonists ={' '}
            {ctx.characters.filter((c) => c.isProtagonist).length}
          </li>
          <li>decisionProfiles = {ctx.decisionProfiles.length}</li>
          <li>drives = {ctx.drives.length}</li>
          <li>relationships = {ctx.relationships.length}</li>
          <li>worldVariables = {ctx.worldVariables.length}</li>
          <li>outlines = {ctx.outlines.length}</li>
          <li>
            chapters = {ctx.chapters.length} （final ={' '}
            {ctx.chapters.filter((c) => c.status === 'final').length}）
          </li>
        </ul>
      </section>

      <p className="font-ui text-[11px] text-ink-mute">
        bookId: {bookId} · stage: {stageId}
      </p>
    </div>
  );
}

function stageOrder(id: StageId): number {
  return { charter: 17, setup: 18, outline: 19, writing: 20, publish: 21 }[id];
}
