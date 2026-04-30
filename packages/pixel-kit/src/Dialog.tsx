import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

export interface PixelDialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function PixelDialog({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: PixelDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(42, 37, 53, 0.4)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'bg-surface text-ink border-2 border-outline rounded-md shadow-pixel-3',
          'min-w-[320px] max-w-[560px] w-[90vw]',
          className,
        )}
      >
        {title != null && (
          <div className="px-4 py-3 border-b-2 border-outline font-pixel text-pixel-md">
            {title}
          </div>
        )}
        <div className="px-4 py-4 font-ui text-sm leading-6">{children}</div>
        {footer != null && (
          <div className="px-4 py-3 border-t-2 border-outline flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
