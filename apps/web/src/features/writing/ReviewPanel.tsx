import type { ReviewIssue, ReviewResult } from '@grid-story/schema';
import { useMemo } from 'react';

const DIMENSION_LABEL: Record<string, string> = {
  consistency: '一致性',
  pacing: '节奏',
  prose: '文笔',
  suggestion: '建议',
};

const DIMENSION_ORDER = ['consistency', 'pacing', 'prose', 'suggestion'];

const SEVERITY_LABEL: Record<string, string> = {
  critical: '严重',
  major: '主要',
  minor: '轻微',
  note: '备注',
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'bg-[#cf222e] text-[#fbf3df]',
  major: 'bg-[#f0a000] text-[#2a2535]',
  minor: 'bg-[#5468ff] text-[#fbf3df]',
  note: 'bg-[#b0a8c0] text-[#2a2535]',
};

interface ReviewPanelProps {
  review: ReviewResult;
  pending?: boolean;
  onAdoptSuggestion?: (issue: ReviewIssue) => void;
  onDismissIssue?: (index: number) => void;
  onNavigateToQuote?: (quote: string) => void;
  onRefresh?: () => void;
}

export function ReviewPanel({ review, pending, onAdoptSuggestion, onDismissIssue, onNavigateToQuote, onRefresh }: ReviewPanelProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, ReviewIssue[]>();
    for (const dim of DIMENSION_ORDER) {
      const items = review.issues.filter((i) => i.dimension === dim);
      if (items.length > 0) map.set(dim, items);
    }
    return map;
  }, [review]);

  if (pending) {
    return (
      <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-3">
        <div className="font-pixel text-pixel-sm text-primary mb-2">AI 审稿中…</div>
        <div className="font-ui text-xs text-ink-mute">这通常需要 30 秒到 2 分钟，请耐心等待。</div>
      </div>
    );
  }

  if (review.issues.length === 0) {
    return (
      <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-3">
        <div className="font-pixel text-pixel-sm text-ink-soft mb-2">审稿完成</div>
        <div className="font-ui text-xs text-ink-mute">未发现需要修改的问题。</div>
      </div>
    );
  }

  return (
    <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1">
      <div className="flex items-center gap-2 px-3 py-2 border-b-2 border-outline-soft">
        <span className="font-pixel text-pixel-sm">审稿意见</span>
        <span className="font-mono text-pixel-sm text-ink-mute">{review.issues.length} 条</span>
        {onRefresh && (
          <button
            type="button"
            className="font-pixel text-pixel-sm text-ink-mute hover:text-primary ml-auto"
            onClick={onRefresh}
          >
            重新审稿
          </button>
        )}
      </div>
      <div className="max-h-[600px] overflow-y-auto pixel-scrollbar">
        {[...grouped.entries()].map(([dim, issues]) => (
          <div key={dim}>
            <div className="font-pixel text-[10px] text-ink-soft bg-surface-raised px-3 py-1 border-b border-outline-soft">
              {DIMENSION_LABEL[dim] ?? dim}
            </div>
            {issues.map((issue, i) => {
              const globalIdx = review.issues.indexOf(issue);
              return (
              <div
                key={i}
                className="px-3 py-2 border-b border-outline-soft last:border-b-0 hover:bg-surface-raised/50 relative group"
              >
                <div className="flex items-start gap-1.5 mb-1">
                  <span
                    className={`font-pixel text-[9px] px-1 py-px rounded-sm shrink-0 ${SEVERITY_COLOR[issue.severity] ?? 'bg-surface-raised text-ink-mute'}`}
                  >
                    {SEVERITY_LABEL[issue.severity] ?? issue.severity}
                  </span>
                  {issue.quote && (
                    <span
                      className={`font-ui text-[10px] italic leading-relaxed line-clamp-2 flex-1 ${
                        onNavigateToQuote
                          ? 'text-primary cursor-pointer hover:underline'
                          : 'text-ink-mute'
                      }`}
                      onClick={() => onNavigateToQuote?.(issue.quote!)}
                      title="点击定位到正文"
                    >
                      「{issue.quote}」
                    </span>
                  )}
                  {onDismissIssue && (
                    <button
                      type="button"
                      className="font-pixel text-[10px] text-ink-mute hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={() => onDismissIssue(globalIdx)}
                      title="忽略此条"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <p className="font-ui text-[11px] text-ink leading-relaxed mb-1">
                  {issue.comment}
                </p>
                {issue.suggestion && (
                  <div className="flex items-start gap-2 mt-1.5">
                    <p className="font-ui text-[11px] text-primary leading-relaxed flex-1">
                      → {issue.suggestion}
                    </p>
                    {onAdoptSuggestion && (
                      <button
                        type="button"
                        className="font-pixel text-[10px] text-primary hover:bg-primary-soft rounded-sm px-2 py-0.5 border border-primary shrink-0"
                        onClick={() => onAdoptSuggestion(issue)}
                      >
                        采纳
                      </button>
                    )}
                  </div>
                )}
              </div>
            )})}
          </div>
        ))}
      </div>
    </div>
  );
}
