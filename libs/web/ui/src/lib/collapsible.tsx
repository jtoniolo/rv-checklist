import { type JSX, type ReactNode } from 'react';
import { cn } from './ui/utils';

/**
 * A styled disclosure — the app's first collapsible (issue #117). Built on
 * native `<details>/<summary>` so the browser owns the open state and the
 * keyboard/screen-reader behaviour; collapsed by default. `onOpenChange`
 * reports toggles for callers that react to visibility (e.g. binding a
 * listener only while open).
 */
export function Collapsible({
  summary,
  children,
  className,
  onOpenChange,
}: {
  readonly summary: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly onOpenChange?: (isOpen: boolean) => void;
}): JSX.Element {
  return (
    <details
      className={cn('group', className)}
      onToggle={(event) => {
        // This lib compiles without the DOM lib, so the details element's
        // `open` flag is read through a structural cast.
        const details = event.currentTarget as unknown as {
          readonly open: boolean;
        };
        onOpenChange?.(details.open);
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-brand-muted select-none hover:text-brand dark:hover:text-ink-inverted [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="text-xs transition-transform group-open:rotate-90"
        >
          ▸
        </span>
        {summary}
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}
