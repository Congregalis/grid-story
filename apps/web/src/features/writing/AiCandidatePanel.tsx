import { PixelButton } from '@grid-story/pixel-kit';
import { useState } from 'react';

interface AiCandidatePanelProps {
  content: string;
  baseContent?: string;
  timestamp: Date;
  onAccept: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  pending?: boolean;
}

export function AiCandidatePanel({
  content,
  baseContent,
  timestamp,
  onAccept,
  onReject,
  onRegenerate,
  pending,
}: AiCandidatePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [view, setView] = useState<'preview' | 'diff'>('preview');

  const preview = content.slice(0, 500);
  const trimmed = content.length > 500;

  return (
    <div className="sticky bottom-0 z-30 bg-surface border-t-2 border-primary shadow-pixel-2 rounded-t-md mx-0 -mb-2 mt-3">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-outline-soft">
        <span className="font-pixel text-pixel-sm text-primary">AI 候选稿</span>
        <span className="font-mono text-pixel-sm text-ink-mute">
          {timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {baseContent !== undefined && (
          <button
            type="button"
            className={`font-pixel text-pixel-sm px-2 py-0.5 border rounded-sm ${
              view === 'diff'
                ? 'text-primary border-primary bg-primary-soft'
                : 'text-ink-mute border-outline-soft hover:text-ink'
            }`}
            onClick={() => setView(view === 'diff' ? 'preview' : 'diff')}
          >
            Diff
          </button>
        )}
        <button
          type="button"
          className="font-pixel text-pixel-sm text-ink-mute hover:text-ink ml-auto"
          onClick={() => setMaximized(!maximized)}
          title={maximized ? '收起面板' : '展开面板'}
        >
          {maximized ? '▼' : '▲'}
        </button>
        <span className="flex gap-2">
          <PixelButton size="sm" variant="ghost" disabled={pending} onClick={onRegenerate}>
            重新生成
          </PixelButton>
          <PixelButton size="sm" variant="ghost" disabled={pending} onClick={onReject}>
            拒绝
          </PixelButton>
          <PixelButton size="sm" disabled={pending} onClick={onAccept}>
            {pending ? '生成中…' : '接受'}
          </PixelButton>
        </span>
      </div>
      <div
        className={`px-4 py-3 overflow-y-auto pixel-scrollbar transition-all ${
          maximized ? 'max-h-[60vh]' : 'max-h-[200px]'
        }`}
      >
        {view === 'diff' && baseContent !== undefined ? (
          <DiffView before={baseContent} after={content} />
        ) : (
          <div className="font-prose text-prose leading-[1.85] whitespace-pre-wrap text-ink-soft text-sm">
            {expanded || maximized ? content : preview}
            {!expanded && !maximized && trimmed && (
              <>
                {' ... '}
                <button
                  type="button"
                  className="font-pixel text-pixel-xs text-primary hover:underline"
                  onClick={() => setExpanded(true)}
                >
                  展开全部
                </button>
              </>
            )}
          </div>
        )}
        {view === 'preview' && expanded && !maximized && (
          <button
            type="button"
            className="font-pixel text-pixel-xs text-primary hover:underline mt-1"
            onClick={() => setExpanded(false)}
          >
            收起
          </button>
        )}
      </div>
    </div>
  );
}

function DiffView({ before, after }: { before: string; after: string }) {
  const parts = buildSingleSpanDiff(before, after);
  return (
    <div className="font-prose text-sm leading-[1.85] whitespace-pre-wrap text-ink">
      {parts.map((part, index) => {
        const key = `${part.type}-${index}-${part.text.slice(0, 8)}`;
        if (part.type === 'delete') {
          return (
            <del key={key} className="bg-danger/15 text-danger px-0.5">
              {part.text}
            </del>
          );
        }
        if (part.type === 'insert') {
          return (
            <ins key={key} className="bg-success/15 text-success no-underline px-0.5">
              {part.text}
            </ins>
          );
        }
        return <span key={key}>{part.text}</span>;
      })}
    </div>
  );
}

function buildSingleSpanDiff(
  before: string,
  after: string,
): { type: 'same' | 'delete' | 'insert'; text: string }[] {
  if (before === after) return [{ type: 'same', text: after }];
  const beforeChars = Array.from(before);
  const afterChars = Array.from(after);
  let start = 0;
  while (
    start < beforeChars.length &&
    start < afterChars.length &&
    beforeChars[start] === afterChars[start]
  ) {
    start += 1;
  }

  let beforeEnd = beforeChars.length - 1;
  let afterEnd = afterChars.length - 1;
  while (
    beforeEnd >= start &&
    afterEnd >= start &&
    beforeChars[beforeEnd] === afterChars[afterEnd]
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  return [
    { type: 'same' as const, text: beforeChars.slice(0, start).join('') },
    { type: 'delete' as const, text: beforeChars.slice(start, beforeEnd + 1).join('') },
    { type: 'insert' as const, text: afterChars.slice(start, afterEnd + 1).join('') },
    { type: 'same' as const, text: beforeChars.slice(beforeEnd + 1).join('') },
  ].filter((part) => part.text.length > 0);
}
