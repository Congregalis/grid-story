export type ClassValue = string | undefined | false | null;

export function cn(...args: ClassValue[]): string {
  return args.filter(Boolean).join(' ');
}
