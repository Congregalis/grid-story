import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  'inline-flex items-center justify-center font-pixel tracking-wide ' +
  'border-2 border-outline rounded-sm shadow-pixel-1 ' +
  'transition-[transform,box-shadow] duration-75 select-none ' +
  'active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ' +
  'disabled:opacity-50 disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-pixel-1 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  ghost: 'bg-surface text-ink hover:bg-surface-raised',
  danger: 'bg-danger text-on-primary hover:brightness-110',
};

const sizes: Record<Size, string> = {
  sm: 'h-7 px-3 text-pixel-sm',
  md: 'h-8 px-4 text-pixel-md',
};

export function PixelButton({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: PixelButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
