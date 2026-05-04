import { PixelButton } from '@grid-story/pixel-kit';

interface ShortcutHelpProps {
  open: boolean;
  onClose: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
const mod = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS = [
  { keys: [mod, 'S'], desc: '保存（不创建新版本）' },
  { keys: [mod, 'Shift', 'S'], desc: '存为新版本' },
  { keys: [mod, 'J'], desc: '下一章' },
  { keys: [mod, 'K'], desc: '上一章' },
  { keys: ['Esc'], desc: '退出专注模式' },
  { keys: ['?'], desc: '显示 / 隐藏快捷键帮助' },
] as const;

export function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40"
      onClick={onClose}
    >
      <div
        className="bg-surface border-2 border-outline rounded-md shadow-pixel-3 p-6 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-pixel text-pixel-md mb-4">快捷键</h2>
        <ul className="space-y-2 mb-4">
          {SHORTCUTS.map((s) => (
            <li key={s.desc} className="flex items-center justify-between font-ui text-sm">
              <span className="text-ink-soft">{s.desc}</span>
              <span className="font-mono text-pixel-sm bg-surface-raised border border-outline rounded-sm px-2 py-0.5">
                {s.keys.join(' + ')}
              </span>
            </li>
          ))}
        </ul>
        <PixelButton variant="ghost" onClick={onClose} className="w-full">
          关闭
        </PixelButton>
      </div>
    </div>
  );
}

export { isMac, mod };
