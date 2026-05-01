import { useState } from 'react';
import { PixelButton, PixelInput } from '@grid-story/pixel-kit';
import { arrayToCsv, type EntityField } from './entity-config';

export type FieldAiAction =
  | 'generate'
  | 'expand'
  | 'shrink'
  | 'polish'
  | 'rephrase'
  | 'custom';

type Phase = 'idle' | 'loading' | 'preview' | 'error';

interface FieldAiRequest {
  action: FieldAiAction;
  hint?: string;
}

export interface FieldAiPopoverProps {
  field: EntityField;
  value: unknown;
  onRun: (request: FieldAiRequest) => Promise<unknown>;
  onAccept: (value: unknown) => void;
  onClose: () => void;
}

const ACTIONS: Array<{ action: FieldAiAction; label: string }> = [
  { action: 'expand', label: '扩写' },
  { action: 'shrink', label: '缩写' },
  { action: 'polish', label: '润色' },
  { action: 'rephrase', label: '换语气' },
];

function valueText(value: unknown): string {
  if (Array.isArray(value)) return arrayToCsv(value);
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

function chipItems(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export function FieldAiPopover({
  field,
  value,
  onRun,
  onAccept,
  onClose,
}: FieldAiPopoverProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [customHint, setCustomHint] = useState('');
  const [preview, setPreview] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<FieldAiRequest | null>(null);
  const [baseValue] = useState(value);

  const run = async (request: FieldAiRequest) => {
    setPhase('loading');
    setError(null);
    setLastRequest(request);
    try {
      const next = await onRun(request);
      setPreview(next);
      setPhase('preview');
    } catch (err) {
      setError((err as Error)?.message ?? 'AI 字段处理失败');
      setPhase('error');
    }
  };

  const accept = () => {
    onAccept(preview);
    onClose();
  };

  return (
    <div className="absolute right-0 top-7 z-30 w-[360px] border-2 border-outline bg-surface-raised p-3 shadow-pixel-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-pixel text-pixel-sm text-ink-soft">
          AI 打磨 · {field.label.replace('*', '').trim()}
        </span>
        <button
          type="button"
          className="font-pixel text-pixel-sm text-ink-soft hover:text-ink"
          onClick={onClose}
          aria-label="关闭"
        >
          x
        </button>
      </div>

      {phase === 'idle' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {ACTIONS.map((item) => (
              <PixelButton
                key={item.action}
                variant="ghost"
                size="sm"
                onClick={() => void run({ action: item.action })}
              >
                {item.label}
              </PixelButton>
            ))}
          </div>
          <div className="flex gap-2">
            <PixelInput
              value={customHint}
              onChange={(event) => setCustomHint(event.target.value)}
              placeholder="自定义要求"
            />
            <PixelButton
              size="sm"
              disabled={!customHint.trim()}
              onClick={() => void run({ action: 'custom', hint: customHint.trim() })}
            >
              发送
            </PixelButton>
          </div>
        </div>
      )}

      {phase === 'loading' && (
        <div className="flex items-center gap-2 font-ui text-sm text-primary">
          <span className="font-pixel text-pixel-md animate-pulse">◆</span>
          正在处理字段…
        </div>
      )}

      {phase === 'preview' && (
        <div className="space-y-3">
          {field.type === 'csv' ? (
            <div className="space-y-2">
              <div>
                <p className="mb-1 font-pixel text-pixel-sm text-ink-soft">原值</p>
                <div className="flex flex-wrap gap-1">
                  {chipItems(baseValue).map((item) => (
                    <span key={item} className="bg-outline-soft px-1.5 py-0.5 font-ui text-xs text-ink-soft">
                      {item}
                    </span>
                  ))}
                  {chipItems(baseValue).length === 0 && (
                    <span className="font-ui text-xs text-ink-mute">空</span>
                  )}
                </div>
              </div>
              <div>
                <p className="mb-1 font-pixel text-pixel-sm text-ink-soft">新值</p>
                <div className="flex flex-wrap gap-1">
                  {chipItems(preview).map((item) => (
                    <span key={item} className="border-2 border-outline px-1.5 py-0.5 font-ui text-xs text-ink">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2 font-ui text-sm">
              <p className="whitespace-pre-wrap text-ink-mute line-through">
                {valueText(baseValue) || '空'}
              </p>
              <p className="whitespace-pre-wrap border-l-4 border-primary bg-primary-soft px-2 py-1 text-ink">
                {valueText(preview) || '空'}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <PixelButton variant="ghost" size="sm" onClick={accept}>
              ✓ 采纳
            </PixelButton>
            <PixelButton variant="ghost" size="sm" onClick={onClose}>
              ✗ 撤销
            </PixelButton>
            <PixelButton
              variant="ghost"
              size="sm"
              disabled={!lastRequest}
              onClick={() => {
                if (lastRequest) void run(lastRequest);
              }}
            >
              ↻ 再来一次
            </PixelButton>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-2">
          <p className="break-words border-2 border-danger px-2 py-1 font-ui text-sm text-danger">
            {error}
          </p>
          <div className="flex justify-end gap-2">
            <PixelButton variant="ghost" size="sm" onClick={onClose}>
              关闭
            </PixelButton>
            <PixelButton
              size="sm"
              disabled={!lastRequest}
              onClick={() => {
                if (lastRequest) void run(lastRequest);
              }}
            >
              重试
            </PixelButton>
          </div>
        </div>
      )}
    </div>
  );
}
