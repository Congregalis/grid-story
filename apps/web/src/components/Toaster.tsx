import { createPortal } from 'react-dom';
import { useToasts, type Toast } from '../lib/toast';

const variantStyles: Record<Toast['variant'], string> = {
  success: 'bg-success text-on-primary',
  error: 'bg-danger text-on-primary',
  info: 'bg-primary text-on-primary',
};

export function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return createPortal(
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col-reverse gap-2 pointer-events-none max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            'pointer-events-auto px-3 py-2 border-2 border-outline rounded-sm shadow-pixel-2 ' +
            'font-pixel text-pixel-md animate-[fadeIn_0.15s_ease-out] ' +
            variantStyles[t.variant]
          }
        >
          {t.message}
        </div>
      ))}
    </div>,
    document.body,
  );
}
