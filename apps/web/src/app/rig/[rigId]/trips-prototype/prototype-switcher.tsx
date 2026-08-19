'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type JSX } from 'react';

/**
 * PROTOTYPE — THROWAWAY (wayfinder #105). Floating bottom-centre variant
 * switcher: arrows cycle the `?variant=` search param (wrapping), `←`/`→`
 * keys do the same, and the bar is hidden in production builds so a stray
 * merge cannot ship it.
 */
export interface PrototypeVariant {
  readonly key: string;
  readonly name: string;
}

export function PrototypeSwitcher({
  variants,
  current,
}: {
  readonly variants: readonly PrototypeVariant[];
  readonly current: string;
}): JSX.Element | undefined {
  const router = useRouter();
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  const go = (delta: number): void => {
    const next = variants[(index + delta + variants.length) % variants.length];
    if (next !== undefined) {
      router.replace(`?variant=${next.key}`, { scroll: false });
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true
      ) {
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const delta = event.key === 'ArrowLeft' ? -1 : 1;
        const next =
          variants[(index + delta + variants.length) % variants.length];
        if (next !== undefined) {
          router.replace(`?variant=${next.key}`, { scroll: false });
        }
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
    };
  }, [index, variants, router]);

  const active = variants[index];
  if (active === undefined || process.env.NODE_ENV === 'production') {
    return undefined;
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => {
          go(-1);
        }}
        className="px-1 text-lg leading-none"
      >
        ←
      </button>
      <span>
        {active.key.toUpperCase()} — {active.name}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => {
          go(1);
        }}
        className="px-1 text-lg leading-none"
      >
        →
      </button>
    </div>
  );
}
