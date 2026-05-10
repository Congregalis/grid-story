import { PixelButton } from '@grid-story/pixel-kit';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { findStage, STAGES } from './definitions';
import { canEnterStage, suggestNextStage } from './navigator';
import { Stepper } from './Stepper';
import type { StageContext, StageId } from './types';
import { useStageContext } from './useStageContext';

interface StageShellProps {
  /** 子组件接收 ctx 后渲染各阶段实际内容 */
  children: (props: { ctx: StageContext; bookId: string; stageId: StageId }) => ReactNode;
}

export function StageShell({ children }: StageShellProps) {
  const { bookId, stage: stageParam } = useParams<{ bookId: string; stage: string }>();
  const navigate = useNavigate();

  if (!bookId) {
    return <div className="p-6 font-ui text-sm text-warning">缺少 bookId</div>;
  }

  return (
    <StageShellInner bookId={bookId} stageParam={stageParam}>
      {children}
    </StageShellInner>
  );

  function StageShellInner({
    bookId,
    stageParam,
    children,
  }: {
    bookId: string;
    stageParam: string | undefined;
    children: StageShellProps['children'];
  }) {
    const { ctx, loading, error } = useStageContext(bookId);

    if (loading || !ctx) {
      return (
        <div className="p-6 font-ui text-sm text-ink-soft">
          {error ? '加载失败，请稍后重试' : '加载中…'}
        </div>
      );
    }

    const stage = findStage(stageParam ?? '');
    if (!stage) {
      return (
        <div className="p-6 space-y-3">
          <p className="font-ui text-sm text-warning">未知阶段：{stageParam}</p>
          <Link className="font-pixel text-pixel-sm text-primary" to={`/books/${bookId}`}>
            返回当前阶段
          </Link>
        </div>
      );
    }

    const enter = canEnterStage(stage.id, ctx);
    if (!enter.allowed) {
      const target = enter.blockedBy ?? STAGES[0].id;
      // 用户跳错了——把他扔回最早未完成的阶段
      navigate(`/books/${bookId}/stages/${target}`, { replace: true });
      return null;
    }

    const progress = stage.computeProgress(ctx);
    const nextSuggestion =
      progress.done && stage.id !== 'publish' ? suggestNextStage(stage.id, ctx) : null;
    const nextStageDef = nextSuggestion ? findStage(nextSuggestion) : null;

    return (
      <div className="min-h-[calc(100vh-3rem)] flex flex-col">
        {/* Header */}
        <header className="border-b-2 border-outline bg-surface px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/books"
              className="font-pixel text-pixel-sm text-ink-soft hover:text-primary"
            >
              ← 书架
            </Link>
            <span className="font-pixel text-pixel-md truncate">
              {ctx.book.title}
            </span>
            <span className="font-ui text-[10px] text-ink-mute border border-outline-soft rounded-sm px-1">
              {ctx.book.engineMode === 'simulation' ? '模拟模式' : '传统模式'}
            </span>
          </div>
          {stage.expertEntry && (
            <Link
              to={`/books/${bookId}/${stage.expertEntry.path}`}
              className="font-pixel text-pixel-sm border-2 border-outline rounded-sm px-2 py-0.5 hover:bg-primary-soft text-ink-soft"
              title="进入专家模式：所有面板可见，跳过引导"
            >
              {stage.expertEntry.label}
            </Link>
          )}
        </header>

        {/* Stepper */}
        <div className="border-b-2 border-outline bg-surface-raised px-6 py-3">
          <Stepper bookId={bookId} currentStageId={stage.id} ctx={ctx} />
        </div>

        {/* Hint bar */}
        {(progress.nextHint || nextStageDef) && (
          <div className="border-b-2 border-outline-soft bg-bg px-6 py-2 flex items-center justify-between gap-3">
            <p className="font-ui text-xs text-ink-soft">
              {nextStageDef ? (
                <>
                  ✓ 本阶段已完成 · 推荐进入{' '}
                  <span className="font-pixel text-primary">{nextStageDef.label}</span>
                </>
              ) : (
                progress.nextHint
              )}
            </p>
            {nextStageDef && (
              <PixelButton
                size="sm"
                onClick={() => navigate(`/books/${bookId}/stages/${nextStageDef.route}`)}
              >
                进入 {nextStageDef.label} →
              </PixelButton>
            )}
          </div>
        )}

        {/* Stage content */}
        <main className="flex-1 overflow-auto">{children({ ctx, bookId, stageId: stage.id })}</main>
      </div>
    );
  }
}
