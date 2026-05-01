import { useEffect, useState, type ReactNode } from 'react';
import { PixelButton, PixelDialog, PixelTextArea } from '@grid-story/pixel-kit';
import { api, ApiError } from '../../lib/api';
import { toast } from '../../lib/toast';
import {
  getEntityTitle,
  type EntityConfig,
  type EntityField,
  type EntityFormValues,
} from './entity-config';

type Phase = 'idle' | 'generating' | 'preview' | 'refining' | 'error';

interface GenerateEntityResponse {
  ok: boolean;
  bookId: string;
  entityType: string;
  entity: EntityFormValues;
}

export interface AiGenerateEntityDialogProps {
  open: boolean;
  bookId: string;
  config: EntityConfig;
  current: EntityFormValues;
  startFromCurrent: boolean;
  onClose: () => void;
  onAccept: (entity: EntityFormValues) => void;
}

function apiErrorText(error: unknown, limit = 500): string {
  if (error instanceof ApiError) {
    const body =
      typeof error.body === 'string'
        ? error.body
        : JSON.stringify(error.body);
    return `后端 ${error.status}: ${body}`.slice(0, limit);
  }
  return ((error as Error)?.message ?? '调用失败').slice(0, limit);
}

function isEmptyValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim().length === 0;
  return value == null;
}

function fieldPreviewValue(field: EntityField, value: unknown): ReactNode {
  if (field.type === 'csv' || Array.isArray(value)) {
    const items = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    if (items.length === 0) return <span className="text-ink-mute">空</span>;
    return (
      <span className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span
            key={item}
            className="border-2 border-outline-soft bg-surface px-1.5 py-0.5 font-ui text-xs"
          >
            {item}
          </span>
        ))}
      </span>
    );
  }

  if (field.type === 'number') {
    return <span>{typeof value === 'number' ? value : 0}</span>;
  }

  if (isEmptyValue(value)) return <span className="text-ink-mute">空</span>;
  return <span className="whitespace-pre-wrap">{String(value)}</span>;
}

export function AiGenerateEntityDialog({
  open,
  bookId,
  config,
  current,
  startFromCurrent,
  onClose,
  onAccept,
}: AiGenerateEntityDialogProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [description, setDescription] = useState('');
  const [feedback, setFeedback] = useState('');
  const [preview, setPreview] = useState<EntityFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase('idle');
    setDescription('');
    setFeedback('');
    setPreview(null);
    setError(null);
  }, [open, config.type, bookId]);

  const close = () => {
    if (phase === 'generating' || phase === 'refining') return;
    onClose();
  };

  const runInitial = async () => {
    const text = description.trim();
    if (!text) return;
    setPhase('generating');
    setError(null);
    try {
      const response = await api.post<GenerateEntityResponse>(
        startFromCurrent ? '/agent/bible/refine' : '/agent/bible/generate',
        startFromCurrent
          ? {
              bookId,
              entityType: config.type,
              current,
              feedback: text,
            }
          : {
              bookId,
              entityType: config.type,
              description: text,
            },
      );
      setPreview(response.entity);
      setFeedback('');
      setPhase('preview');
      toast.success(startFromCurrent ? `已修改${config.label}草案` : `已生成${config.label}草案`);
    } catch (err) {
      const msg = apiErrorText(err);
      setError(msg);
      setPhase('error');
      toast.error(`AI 生成失败：${msg.slice(0, 200)}`);
    }
  };

  const refine = async () => {
    const text = feedback.trim();
    if (!preview || !text) return;
    setPhase('refining');
    setError(null);
    try {
      const response = await api.post<GenerateEntityResponse>('/agent/bible/refine', {
        bookId,
        entityType: config.type,
        current: preview,
        feedback: text,
      });
      setPreview(response.entity);
      setFeedback('');
      setPhase('preview');
      toast.success(`已继续修改${config.label}`);
    } catch (err) {
      const msg = apiErrorText(err);
      setError(msg);
      setPhase('error');
      toast.error(`AI 修改失败：${msg.slice(0, 200)}`);
    }
  };

  const accept = () => {
    if (!preview) return;
    onAccept(preview);
    onClose();
  };

  const title = preview ? getEntityTitle(config, preview) : '';

  return (
    <PixelDialog
      open={open}
      onClose={close}
      title={`AI 生成完整${config.label}`}
      className="!max-w-[760px]"
      footer={
        phase === 'preview' ? (
          <>
            <PixelButton variant="ghost" onClick={() => setPhase('idle')}>
              重新描述
            </PixelButton>
            <PixelButton onClick={accept}>采纳</PixelButton>
          </>
        ) : phase === 'generating' || phase === 'refining' ? (
          <PixelButton variant="ghost" disabled>
            {phase === 'generating' ? '生成中…' : '修改中…'}
          </PixelButton>
        ) : phase === 'error' ? (
          <>
            <PixelButton variant="ghost" onClick={close}>
              关闭
            </PixelButton>
            <PixelButton disabled={!description.trim()} onClick={() => void runInitial()}>
              重试
            </PixelButton>
          </>
        ) : (
          <>
            <PixelButton variant="ghost" onClick={close}>
              取消
            </PixelButton>
            <PixelButton disabled={!description.trim()} onClick={() => void runInitial()}>
              {startFromCurrent ? '基于当前修改' : '生成'}
            </PixelButton>
          </>
        )
      }
    >
      <div className="space-y-3">
        {(phase === 'idle' || phase === 'error') && (
          <>
            <label className="block">
              <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">
                {startFromCurrent ? '修改要求 *' : '一句话描述 *'}
              </span>
              <PixelTextArea
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={
                  startFromCurrent
                    ? `比如：让这个${config.label}更贴合主线冲突，动机更狠一点。`
                    : `比如：一个被宗门逐出的${config.label}，手里握着所有人都想抢的秘密。`
                }
                autoFocus
              />
            </label>
            <p className="font-ui text-xs text-ink-mute">
              调用{' '}
              <code className="font-mono">
                {startFromCurrent ? 'POST /agent/bible/refine' : 'POST /agent/bible/generate'}
              </code>
              ，AI 会带上 Story Charter、已有 Bible 和大纲上下文。
            </p>
          </>
        )}

        {phase === 'generating' && (
          <div className="border-2 border-outline bg-surface-raised p-3">
            <span className="font-pixel text-pixel-md text-primary animate-pulse">◆</span>
            <span className="ml-2 font-ui text-sm text-ink-soft">
              正在生成完整{config.label}字段…
            </span>
          </div>
        )}

        {(phase === 'preview' || phase === 'refining') && preview && (
          <>
            <div className="border-2 border-outline bg-surface-raised p-3">
              <div className="mb-3 flex items-center gap-2">
                <span className="font-pixel text-pixel-sm bg-primary px-1.5 py-0.5 text-on-primary">
                  {config.label}
                </span>
                <strong className="font-ui text-sm text-ink">{title}</strong>
              </div>
              <div className="grid max-h-[46vh] grid-cols-1 gap-2 overflow-auto pr-2 pixel-scrollbar lg:grid-cols-2">
                {config.fields.map((field) => (
                  <div
                    key={field.key}
                    className={
                      field.span === 'full'
                        ? 'border-2 border-outline-soft bg-surface p-2 lg:col-span-2'
                        : 'border-2 border-outline-soft bg-surface p-2'
                    }
                  >
                    <p className="mb-1 font-pixel text-pixel-sm text-ink-soft">
                      {field.label}
                    </p>
                    <div className="font-ui text-sm text-ink">
                      {fieldPreviewValue(field, preview[field.key])}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">
                继续修改
              </span>
              <PixelTextArea
                rows={3}
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                disabled={phase === 'refining'}
                placeholder="比如：关系更危险一点，背景少写履历，多写伤疤。"
              />
            </label>
            <div className="flex justify-end">
              <PixelButton
                variant="ghost"
                size="sm"
                disabled={phase === 'refining' || !feedback.trim()}
                onClick={() => void refine()}
              >
                {phase === 'refining' ? '修改中…' : '继续修改'}
              </PixelButton>
            </div>
          </>
        )}

        {error && (
          <p className="break-words border-2 border-danger px-3 py-2 font-ui text-sm text-danger">
            {error}
          </p>
        )}

        {preview && (
          <p className="font-ui text-xs text-ink-mute">
            采纳只会回填表单；真正入库仍由主表单的「保存」控制。
            数组字段会按逗号形式回到输入框。
          </p>
        )}
      </div>
    </PixelDialog>
  );
}
