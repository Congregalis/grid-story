import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export interface PixelScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  maxHeight?: number | string;
}

export function PixelScrollArea({
  maxHeight = 320,
  className,
  style,
  ...props
}: PixelScrollAreaProps) {
  return (
    <div
      className={cn('pixel-scrollbar overflow-auto', className)}
      style={{ maxHeight, ...style }}
      {...props}
    />
  );
}
