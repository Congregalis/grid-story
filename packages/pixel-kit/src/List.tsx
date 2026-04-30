import type { HTMLAttributes, LiHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export function PixelList({
  className,
  ...props
}: HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      className={cn(
        'bg-surface border-2 border-outline rounded-sm shadow-pixel-1 divide-y-2 divide-outline-soft',
        className,
      )}
      {...props}
    />
  );
}

export interface PixelListItemProps extends LiHTMLAttributes<HTMLLIElement> {
  active?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export function PixelListItem({
  active,
  leading,
  trailing,
  className,
  children,
  ...props
}: PixelListItemProps) {
  return (
    <li
      className={cn(
        'flex items-center gap-2 px-3 py-2 font-ui text-sm cursor-pointer',
        'hover:bg-primary-soft',
        active && 'bg-primary-soft',
        className,
      )}
      {...props}
    >
      {leading != null && <span className="shrink-0">{leading}</span>}
      <span className="flex-1 min-w-0 truncate">{children}</span>
      {trailing != null && (
        <span className="shrink-0 text-ink-soft">{trailing}</span>
      )}
    </li>
  );
}
