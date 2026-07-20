import type { JSX, ReactNode } from 'react';

export interface PageProps {
  readonly children: ReactNode;
}

/**
 * The app's mobile-first page frame (issue #11 follow-up; ADR-0010, ADR-0013).
 *
 * Base styles target the phone — a comfortable single column with safe-area
 * padding — then the `sm` and `lg` breakpoints widen the content measure and
 * padding, so the layout genuinely adapts upward on larger screens instead of
 * staying a phone-width column. Every screen wraps its content in this, so
 * responsiveness is inherited by every slice rather than re-derived (and
 * re-forgotten) each time.
 */
export function Page({ children }: PageProps): JSX.Element {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:max-w-2xl sm:gap-7 sm:px-8 lg:max-w-4xl lg:gap-8 lg:px-10">
      {children}
    </main>
  );
}
