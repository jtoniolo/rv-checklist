'use client';

import type { Id, Rig } from '@rv-checklist/domain';
import {
  activeRigCleared,
  activeRigSelected,
  selectActiveRigId,
  useAppDispatch,
  useAppSelector,
  useListRigsQuery,
  useMeQuery,
} from '@rv-checklist/web-data-access';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rv-checklist/web-ui';
import { useEffect, useState, type JSX } from 'react';
import { AvatarMenu } from './avatar-menu';
import { ChecklistsScreen } from './checklists-screen';
import { HomeScreen } from './home-screen';
import { MaintenanceScreen } from './maintenance-screen';
import { RigManager } from './rig-manager';
import { useAppNavigation, type Route } from './use-app-navigation';

/** The four destinations, driving the desktop nav and the mobile tab bar. */
const NAV_ITEMS: readonly { route: Route; label: string; icon: string }[] = [
  { route: 'home', label: 'Home', icon: '⌂' },
  { route: 'checklists', label: 'Checklists', icon: '☑' },
  { route: 'maintenance', label: 'Maintenance', icon: '🔧' },
  { route: 'rig', label: 'Rig', icon: '🚐' },
];

/** The shell's shared content frame (header row and main column alike). */
const frameClass = 'mx-auto w-full max-w-5xl px-4 lg:px-6';

/**
 * The signed-in app shell (issue #22 — the prototype's winning "Hybrid"
 * variant, one responsive component). Mobile-first: a sticky top bar with the
 * rig-switcher pill and the avatar, a bottom tab bar (Home / Checklists /
 * Rig), and drill-down navigation. From `lg` up the same component grows B's
 * desktop shell: brand + inline nav + rig select move into the sticky header,
 * checklists become master–detail, and the tab bar disappears.
 *
 * Navigation is client state synced with browser history (issue #40): which
 * screen is up, which checklist is open, and which run is open — held here
 * so every summary can click through (home's continue cards jump straight
 * into a run). Every forward navigation pushes a history entry; the browser
 * Back button reverses the last navigation via `popstate`; reloads and
 * deep-links restore the position from the URL.
 */
export function AppShell(): JSX.Element {
  const dispatch = useAppDispatch();
  const { data: owner } = useMeQuery();
  const { data: rigs } = useListRigsQuery();
  const activeRigId = useAppSelector(selectActiveRigId);

  const { location, navigate, back } = useAppNavigation();
  const { route, openChecklistId, openRunId, openTaskId } = location;

  // Reconcile the persisted selection with the server's rigs once they load: a
  // stale id (the rig was deleted elsewhere) falls back to the first rig, and
  // with no selection yet the first rig becomes active.
  useEffect(() => {
    if (!rigs) {
      return;
    }
    if (activeRigId && rigs.some((rig) => rig.id === activeRigId)) {
      return;
    }
    const first = rigs[0];
    if (first) {
      dispatch(activeRigSelected(first.id));
    } else if (activeRigId) {
      dispatch(activeRigCleared());
    }
  }, [rigs, activeRigId, dispatch]);

  const activeRig = rigs?.find((rig) => rig.id === activeRigId);

  const selectRig = (id: Id): void => {
    dispatch(activeRigSelected(id));
    // The open checklist / run / task belonged to the previous rig — clear
    // them but keep the current screen. Replace (don't push) so Back doesn't
    // revisit a stale drill-in under a different rig.
    navigate({ route }, { replace: true });
  };

  const go = (next: Route): void => {
    navigate({ route: next });
  };

  const openChecklist = (id: Id): void => {
    navigate({ route: 'checklists', openChecklistId: id });
  };

  const openRun = (checklistId: Id, runId: Id): void => {
    navigate({
      route: 'checklists',
      openChecklistId: checklistId,
      openRunId: runId,
    });
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Sticky header — one element, two personalities. */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-surface/90 backdrop-blur dark:bg-surface-dark/90">
        <div
          className={`${frameClass} flex items-center justify-between gap-3 py-2.5`}
        >
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => {
                go('home');
              }}
              className="hidden text-lg font-bold tracking-tight text-brand lg:block dark:text-ink-inverted"
            >
              RV Checklist
            </button>
            <nav className="hidden gap-1 text-sm font-medium lg:flex">
              {NAV_ITEMS.map(({ route: target, label }) => (
                <NavLink
                  key={target}
                  label={label}
                  active={route === target}
                  onClick={() => {
                    go(target);
                  }}
                />
              ))}
            </nav>
            <RigPill rigs={rigs} activeRig={activeRig} onSelect={selectRig} />
          </div>
          <div className="flex items-center gap-3">
            {/* Desktop: the rig select folded into the header. */}
            {rigs && rigs.length > 0 ? (
              <div className="hidden items-center gap-1.5 text-sm text-brand-muted lg:flex">
                <span aria-hidden>🚐</span>
                <Select value={activeRig?.id ?? ''} onValueChange={selectRig}>
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
              </div>
            ) : undefined}
            {owner ? <AvatarMenu owner={owner} /> : undefined}
          </div>
        </div>
      </header>

      <main
        className={`${frameClass} flex-1 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pt-6 lg:pb-10`}
      >
        {route === 'home' ? (
          <HomeScreen
            owner={owner}
            rigs={rigs}
            activeRig={activeRig}
            onOpenChecklist={openChecklist}
            onOpenRun={openRun}
            onGoChecklists={() => {
              go('checklists');
            }}
            onGoRig={() => {
              go('rig');
            }}
          />
        ) : undefined}
        {route === 'checklists' ? (
          <ChecklistsScreen
            activeRig={activeRig}
            openChecklistId={openChecklistId}
            openRunId={openRunId}
            // Switching checklists must also close any open run — otherwise
            // the old run would render under the new checklist's name.
            onOpenChecklist={openChecklist}
            onOpenRun={(runId) => {
              navigate({
                route: 'checklists',
                ...(openChecklistId !== undefined && { openChecklistId }),
                openRunId: runId,
              });
            }}
            onCloseRun={back}
            onBackToList={back}
            onGoRig={() => {
              go('rig');
            }}
          />
        ) : undefined}
        {route === 'maintenance' ? (
          <MaintenanceScreen
            activeRig={activeRig}
            rigId={activeRig?.id ?? ''}
            openTaskId={openTaskId}
            view={location.view}
          />
        ) : undefined}
        {route === 'rig' ? <RigManager /> : undefined}
      </main>

      {/* Mobile-only bottom tab bar. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-hairline bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:bg-surface-dark/95">
        {NAV_ITEMS.map(({ route: target, label, icon }) => (
          <TabButton
            key={target}
            label={label}
            icon={icon}
            active={route === target}
            onClick={() => {
              go(target);
            }}
          />
        ))}
      </nav>
    </div>
  );
}

/** Mobile rig-switcher pill: the active rig's nickname opening a dropdown. */
function RigPill({
  rigs,
  activeRig,
  onSelect,
}: {
  readonly rigs: readonly Rig[] | undefined;
  readonly activeRig: Rig | undefined;
  readonly onSelect: (id: Id) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="flex items-center gap-2 rounded-full border border-hairline px-3 py-1.5 text-sm font-semibold text-brand hover:border-brand dark:text-ink-inverted"
      >
        <span aria-hidden>🚐</span>
        {activeRig?.nickname ?? 'No rig'}
        <span aria-hidden className="text-xs text-brand-muted">
          ▾
        </span>
      </button>
      {open && rigs && rigs.length > 0 ? (
        <>
          {/* Click-away backdrop. */}
          <button
            type="button"
            aria-label="Close rig menu"
            onClick={() => {
              setOpen(false);
            }}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute left-0 z-50 mt-2 w-64 rounded-xl border border-hairline bg-surface p-1.5 shadow-lg dark:bg-surface-dark">
            {rigs.map((rig) => (
              <button
                key={rig.id}
                type="button"
                onClick={() => {
                  onSelect(rig.id);
                  setOpen(false);
                }}
                className={`flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-hairline/40 ${
                  rig.id === activeRig?.id ? 'bg-hairline/30' : ''
                }`}
              >
                <span className="text-sm font-semibold text-brand dark:text-ink-inverted">
                  {rig.nickname}
                  {rig.id === activeRig?.id ? ' ✓' : ''}
                </span>
                <span className="text-xs text-brand-muted">
                  {rigDetails(rig)}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : undefined}
    </div>
  );
}

/** "2019 Airstream Flying Cloud" — the parts a rig has, joined. */
function rigDetails(rig: Rig): string {
  return [rig.year, rig.make, rig.model]
    .filter((part): part is string | number => part !== undefined)
    .join(' ');
}

function NavLink({
  label,
  active,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 ${
        active
          ? 'bg-brand text-white'
          : 'text-brand-muted hover:text-brand dark:hover:text-ink-inverted'
      }`}
    >
      {label}
    </button>
  );
}

function TabButton({
  label,
  icon,
  active,
  onClick,
}: {
  readonly label: string;
  readonly icon: string;
  readonly active: boolean;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
        active ? 'text-brand dark:text-ink-inverted' : 'text-brand-muted'
      }`}
    >
      <span aria-hidden className="text-xl leading-none">
        {icon}
      </span>
      {label}
      <span
        aria-hidden
        className={`h-0.5 w-8 rounded-full ${active ? 'bg-brand dark:bg-ink-inverted' : ''}`}
      />
    </button>
  );
}
