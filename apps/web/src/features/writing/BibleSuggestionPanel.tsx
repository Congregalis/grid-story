import type { BibleSuggestion } from '@grid-story/schema';
import { entityConfigs } from '../bible/entity-config';

const CONFIDENCE_LABEL: Record<BibleSuggestion['confidence'], string> = {
  high: '高',
  medium: '中',
  low: '低',
};

interface BibleSuggestionPanelProps {
  suggestions: BibleSuggestion[];
  pending?: boolean;
  onAccept: (suggestion: BibleSuggestion) => void;
  onDismiss: (suggestion: BibleSuggestion) => void;
  onRefresh?: () => void;
}

export function BibleSuggestionPanel({
  suggestions,
  pending,
  onAccept,
  onDismiss,
  onRefresh,
}: BibleSuggestionPanelProps) {
  if (pending) {
    return (
      <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-3">
        <div className="font-pixel text-pixel-sm text-primary mb-2">设定扫描中…</div>
        <div className="font-ui text-xs text-ink-mute">正在从本章正文中提取可入库的新设定。</div>
      </div>
    );
  }

  return (
    <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1">
      <div className="flex items-center gap-2 px-3 py-2 border-b-2 border-outline-soft">
        <span className="font-pixel text-pixel-sm">入库候选</span>
        <span className="font-mono text-pixel-sm text-ink-mute">{suggestions.length} 条</span>
        {onRefresh && (
          <button
            type="button"
            className="font-pixel text-pixel-sm text-ink-mute hover:text-primary ml-auto"
            onClick={onRefresh}
          >
            重新扫描
          </button>
        )}
      </div>
      {suggestions.length === 0 ? (
        <div className="font-ui text-xs text-ink-mute text-center p-3">暂无需要入库的新设定。</div>
      ) : (
        <div className="max-h-[600px] overflow-y-auto pixel-scrollbar">
          {suggestions.map((suggestion) => {
            const config = entityConfigs[suggestion.entityType];
            return (
              <div
                key={suggestion.id}
                className="px-3 py-2 border-b border-outline-soft last:border-b-0 hover:bg-surface-raised/50"
              >
                <div className="flex items-start gap-1.5 mb-1">
                  <span
                    className={`font-pixel text-[9px] px-1 py-px rounded-sm shrink-0 ${config.tagClassName} text-[#fbf3df]`}
                  >
                    {config.label}
                  </span>
                  <span className="font-ui text-xs text-ink font-semibold leading-relaxed">
                    {suggestion.title}
                  </span>
                  <span className="font-pixel text-[9px] text-ink-mute ml-auto">
                    置信 {CONFIDENCE_LABEL[suggestion.confidence]}
                  </span>
                </div>
                <p className="font-ui text-[11px] text-ink-soft leading-relaxed">
                  证据：{suggestion.evidence}
                </p>
                <p className="font-ui text-[11px] text-ink-mute leading-relaxed mt-1">
                  {suggestion.reason}
                </p>
                <div className="flex gap-1.5 mt-2">
                  <button
                    type="button"
                    className="font-pixel text-[10px] text-primary hover:bg-primary-soft rounded-sm px-2 py-0.5 border border-primary"
                    onClick={() => onAccept(suggestion)}
                  >
                    入库
                  </button>
                  <button
                    type="button"
                    className="font-pixel text-[10px] text-ink-mute hover:bg-surface-raised rounded-sm px-2 py-0.5 border border-outline-soft"
                    onClick={() => onDismiss(suggestion)}
                  >
                    忽略
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
