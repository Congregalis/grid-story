import { PixelButton, PixelDialog, PixelInput, PixelTextArea } from '@grid-story/pixel-kit';
import { useState } from 'react';

export interface DraftRequest {
  sceneBrief: string;
  style: string;
  pov: string;
  minWords: number;
  previousEnding?: string;
}

export interface AiDraftDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (req: DraftRequest) => void;
  pending?: boolean;
  error?: string | null;
  defaultPreviousEnding?: string;
}

export function AiDraftDialog({
  open,
  onClose,
  onSubmit,
  pending,
  error,
  defaultPreviousEnding,
}: AiDraftDialogProps) {
  const [sceneBrief, setSceneBrief] = useState('');
  const [style, setStyle] = useState('文学性、克制、冷色调');
  const [pov, setPov] = useState('第三人称');
  const [minWords, setMinWords] = useState(1200);
  const [usePrev, setUsePrev] = useState(false);
  const sceneBriefId = 'ai-draft-scene-brief';
  const styleId = 'ai-draft-style';
  const povId = 'ai-draft-pov';
  const minWordsId = 'ai-draft-min-words';

  const submit = () => {
    if (!sceneBrief.trim()) return;
    onSubmit({
      sceneBrief: sceneBrief.trim(),
      style: style.trim() || '文学性',
      pov: pov.trim() || '第三人称',
      minWords,
      previousEnding: usePrev ? defaultPreviousEnding : undefined,
    });
  };

  return (
    <PixelDialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title="AI 生成首稿"
      footer={
        <>
          <PixelButton variant="ghost" disabled={pending} onClick={onClose}>
            取消
          </PixelButton>
          <PixelButton disabled={pending || !sceneBrief.trim()} onClick={submit}>
            {pending ? '生成中…' : '开始生成'}
          </PixelButton>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block" htmlFor={sceneBriefId}>
          <span className="block font-pixel text-pixel-sm mb-1 text-ink-soft">场景说明 *</span>
          <PixelTextArea
            id={sceneBriefId}
            rows={3}
            value={sceneBrief}
            onChange={(e) => setSceneBrief(e.target.value)}
            placeholder="主角抵达雪夜城门，与守将第一次交锋"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label htmlFor={styleId}>
            <span className="block font-pixel text-pixel-sm mb-1 text-ink-soft">风格</span>
            <PixelInput id={styleId} value={style} onChange={(e) => setStyle(e.target.value)} />
          </label>
          <label htmlFor={povId}>
            <span className="block font-pixel text-pixel-sm mb-1 text-ink-soft">视角</span>
            <PixelInput id={povId} value={pov} onChange={(e) => setPov(e.target.value)} />
          </label>
          <label htmlFor={minWordsId}>
            <span className="block font-pixel text-pixel-sm mb-1 text-ink-soft">最少字数</span>
            <PixelInput
              id={minWordsId}
              type="number"
              value={minWords}
              onChange={(e) => setMinWords(Math.max(200, Number(e.target.value) || 0))}
            />
          </label>
          {defaultPreviousEnding != null && (
            <label className="flex items-end gap-2 text-sm font-ui">
              <input
                type="checkbox"
                checked={usePrev}
                onChange={(e) => setUsePrev(e.target.checked)}
              />
              <span>带上当前章末尾作为承接</span>
            </label>
          )}
        </div>
        {error && (
          <p className="font-ui text-sm text-danger border-2 border-danger bg-danger/10 px-3 py-2">
            {error}
          </p>
        )}
        <p className="font-ui text-xs text-ink-mute">
          AI 会参考当前作品的设定和大纲生成首稿。篇幅越长，等待时间越久。
        </p>
      </div>
    </PixelDialog>
  );
}
