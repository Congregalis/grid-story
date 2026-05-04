import { PixelButton } from '@grid-story/pixel-kit';
import { useState } from 'react';

interface AiCandidatePanelProps {
  content: string;
  timestamp: Date;
  onAccept: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  pending?: boolean;
}

export function AiCandidatePanel({
  content,
  timestamp,
  onAccept,
  onReject,
  onRegenerate,
  pending,
}: AiCandidatePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [maximized, setMaximized] = useState(false);

  const preview = content.slice(0, 500);
  const trimmed = content.length > 500;

  return (
    <div className="sticky bottom-0 z-30 bg-surface border-t-2 border-primary shadow-pixel-2 rounded-t-md mx-0 -mb-2 mt-3">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-outline-soft">
        <span className="font-pixel text-pixel-sm text-primary">
          AI 候选稿
        </span>
        <span className="font-mono text-pixel-sm text-ink-mute">
          {timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <button
          type="button"
          className="font-pixel text-pixel-sm text-ink-mute hover:text-ink ml-auto"
          onClick={() => setMaximized(!maximized)}
          title={maximized ? '收起面板' : '展开面板'}
        >
          {maximized ? '▼' : '▲'}
        </button>
        <span className="flex gap-2">
          <PixelButton
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={onRegenerate}
          >
            重新生成
          </PixelButton>
          <PixelButton
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={onReject}
          >
            拒绝
          </PixelButton>
          <PixelButton
            size="sm"
            disabled={pending}
            onClick={onAccept}
          >
            {pending ? '生成中…' : '接受'}
          </PixelButton>
        </span>
      </div>
      <div
        className={`px-4 py-3 overflow-y-auto pixel-scrollbar transition-all ${
          maximized ? 'max-h-[60vh]' : 'max-h-[200px]'
        }`}
      >
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
        {expanded && !maximized && (
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
