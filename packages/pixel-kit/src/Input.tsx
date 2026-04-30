import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

const base =
  'block w-full bg-surface-raised text-ink font-ui ' +
  'border-2 border-outline rounded-sm px-3 ' +
  'placeholder:text-ink-mute ' +
  'focus:outline-none focus:border-primary focus:shadow-pixel-1-primary ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

export function PixelInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, 'h-8 text-sm', className)} {...props} />;
}

export function PixelTextArea({
  className,
  rows = 4,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={cn(base, 'py-2 text-sm leading-6 resize-y', className)}
      {...props}
    />
  );
}
