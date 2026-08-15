'use client';

import type { Id, Owner, Rig } from '@rv-checklist/domain';
import { selectThemeKey, useAppSelector } from '@rv-checklist/web-data-access';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rv-checklist/web-ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, type JSX, type ReactNode } from 'react';
import { AvatarMenu } from '../../avatar-menu';
import { themeFor } from '../../themes';

const NAV_ITEMS: readonly {
  label: string;
  icon: string;
  path: (rigId: Id) => string;
}[] = [
  { label: 'Home', icon: '⌂', path: (id) => `/rig/${id}` },
  { label: 'Checklists', icon: '☑', path: (id) => `/rig/${id}/checklists` },
  { label: 'Maintenance', icon: '🔧', path: (id) => `/rig/${id}/maintenance` },
  { label: 'Rig', icon: '🚐', path: (id) => `/rig/${id}/settings` },
];

const frameClass = 'mx-auto w-full max-w-5xl px-4 lg:px-6';

/**
 * The signed-in shell for rig-scoped routes (ADR-0018). Same visual design
 * as the original AppShell (issue #22): sticky header with brand, inline
 * nav, rig selector, and avatar on desktop; rig pill and bottom tab bar on
 * mobile. Receives owner and rigs as props from the server layout so the
 * header renders in the SSR HTML. Navigations use Next.js Link/router.
 */
export function RigShell({
  rigId,
  owner,
  rigs,
  children,
}: {
  readonly rigId: Id;
  readonly owner: Owner;
  readonly rigs: readonly Rig[];
  readonly children: ReactNode;
}): JSX.Element {
  const themeKey = useAppSelector(selectThemeKey);
  const vars = useMemo(() => themeFor(themeKey).vars, [themeKey]);
  const activeRig = rigs.find((r) => r.id === rigId);
  const pathname = usePathname();

  useEffect(() => {
    for (const [name, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(name, value);
    }
    return (): void => {
      for (const name of Object.keys(vars)) {
        document.documentElement.style.removeProperty(name);
      }
    };
  }, [vars]);

  useEffect(() => {
    document.cookie = `rv.last-rig=${rigId}; path=/; SameSite=Lax`;
  }, [rigId]);

  const isActive = (href: string): boolean =>
    pathname === href ||
    (href !== `/rig/${rigId}` && pathname.startsWith(href));

  return (
    <div
      style={vars}
      data-theme-surface
      className="min-h-dvh bg-surface text-ink dark:bg-surface-dark dark:text-ink-inverted"
    >
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 border-b border-hairline bg-surface/90 backdrop-blur dark:bg-surface-dark/90">
          <div
            className={`${frameClass} flex items-center justify-between gap-3 py-2.5`}
          >
            <div className="flex items-center gap-6">
              <Link
                href={`/rig/${rigId}`}
                className="hidden text-lg font-bold tracking-tight text-brand lg:block dark:text-ink-inverted"
              >
                RV Checklist
              </Link>
              <nav className="hidden gap-1 text-sm font-medium lg:flex">
                {NAV_ITEMS.map(({ label, path }) => {
                  const href = path(rigId);
                  return (
                    <Link
                      key={label}
                      href={href}
                      aria-current={isActive(href) ? 'page' : undefined}
                      className={`rounded-md px-3 py-1.5 ${
                        isActive(href)
                          ? 'bg-brand text-white'
                          : 'text-brand-muted hover:text-brand dark:hover:text-ink-inverted'
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </nav>
              <span className="flex items-center gap-2 rounded-full border border-hairline px-3 py-1.5 text-sm font-semibold text-brand lg:hidden dark:text-ink-inverted">
                {activeRig?.nickname ?? 'No rig'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {rigs.length > 0 ? (
                <div className="hidden items-center gap-1.5 text-sm text-brand-muted lg:flex">
                  <RigSelect
                    rigs={rigs}
                    activeRigId={rigId}
                    pathname={pathname}
                  />
                </div>
              ) : undefined}
              <AvatarMenu owner={owner} />
            </div>
          </div>
        </header>

        <main
          className={`${frameClass} flex-1 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pt-6 lg:pb-10`}
        >
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-hairline bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:bg-surface-dark/95">
          {NAV_ITEMS.map(({ label, icon, path }) => {
            const href = path(rigId);
            const isCurrent = isActive(href);
            return (
              <Link
                key={label}
                href={href}
                aria-current={isCurrent ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
                  isCurrent
                    ? 'text-brand dark:text-ink-inverted'
                    : 'text-brand-muted'
                }`}
              >
                <span aria-hidden className="text-xl leading-none">
                  {icon}
                </span>
                {label}
                <span
                  aria-hidden
                  className={`h-0.5 w-8 rounded-full ${isCurrent ? 'bg-brand dark:bg-ink-inverted' : ''}`}
                />
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/**
 * Compute the equivalent rig-scoped path when switching rigs. Preserves the
 * first segment after the rigId (the section — maintenance, checklists, etc.)
 * but drops deeper entity-specific segments. From `/rig/abc/maintenance/task123`
 * switching to rig xyz produces `/rig/xyz/maintenance`.
 */
function equivalentPath(pathname: string, newRigId: string): string {
  const segments = pathname.split('/');
  const section = segments[3];
  return section ? `/rig/${newRigId}/${section}` : `/rig/${newRigId}`;
}

function RigSelect({
  rigs,
  activeRigId,
  pathname,
}: {
  readonly rigs: readonly Rig[];
  readonly activeRigId: Id;
  readonly pathname: string;
}): JSX.Element {
  const router = useRouter();
  return (
    <Select
      value={activeRigId}
      onValueChange={(id: string) => {
        document.cookie = `rv.last-rig=${id}; path=/; SameSite=Lax`;
        router.push(equivalentPath(pathname, id));
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label="Active rig"
        className="border-transparent bg-transparent font-semibold text-brand shadow-none hover:border-hairline dark:bg-transparent dark:text-ink-inverted dark:hover:bg-transparent"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {rigs.map((rig) => (
          <SelectItem key={rig.id} value={rig.id}>
            {rig.nickname}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
