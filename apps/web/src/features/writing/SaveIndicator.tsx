export type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

interface SaveIndicatorProps {
  state: SaveState;
  lastSavedAt: Date | null;
}

const STATE_CONFIG: Record<SaveState, { label: string; dot: string; textColor: string }> = {
  idle: { label: '', dot: '', textColor: 'text-ink-mute' },
  saving: { label: '保存中…', dot: 'bg-warning', textColor: 'text-warning' },
  saved: { label: '已保存', dot: 'bg-success', textColor: 'text-success' },
  offline: { label: '离线 · 已暂存本地', dot: 'bg-danger', textColor: 'text-danger' },
  error: { label: '保存失败', dot: 'bg-danger', textColor: 'text-danger' },
};

export function SaveIndicator({ state, lastSavedAt }: SaveIndicatorProps) {
  const cfg = STATE_CONFIG[state];
  if (state === 'idle') return null;

  return (
    <span className={`inline-flex items-center gap-1.5 font-pixel text-pixel-sm ${cfg.textColor}`}>
      <span className={`inline-block w-2 h-2 rounded-full ${cfg.dot} ${state === 'saving' ? 'animate-pulse' : ''}`} />
      {cfg.label}
      {lastSavedAt && state === 'saved' && (
        <span className="font-mono text-pixel-sm text-ink-mute">
          {lastSavedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </span>
  );
}
