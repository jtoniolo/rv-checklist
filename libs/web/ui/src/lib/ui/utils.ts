import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class lists, later entries winning conflicts — the `cn`
 * helper every vendored shadcn/ui component composes its classes with.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
