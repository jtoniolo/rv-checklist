'use client';

import { Page } from '@rv-checklist/web-ui';
import { useSearchParams } from 'next/navigation';
import { useState, type JSX } from 'react';
import { PrototypeSwitcher } from './prototype-switcher';
import { VariantA } from './variant-a';
import { VariantB } from './variant-b';
import { VariantC } from './variant-c';

/**
 * PROTOTYPE — THROWAWAY (wayfinder #105). Mock data, shared derivations, and
 * the shared in-memory state (arrivals, runs) for all three trip-screen
 * variants. State lives here so flipping variants keeps what you did, and
 * variants stay pure rendering.
 */

export interface ProtoStop {
  readonly id: string;
  readonly campground?: string;
  readonly campsite?: string;
  readonly arrivalDate?: string;
  readonly nights?: number;
  readonly checkInTime?: string;
  readonly checkOutTime?: string;
  readonly bookingNumber?: string;
  readonly costCents?: number;
  readonly address?: string;
  readonly phone?: string;
  readonly legKm?: number;
  readonly notes?: string;
}

export interface ProtoChecklist {
  readonly id: string;
  readonly name: string;
  readonly items: number;
}

export interface ProtoRun {
  readonly id: string;
  readonly checklistName: string;
  readonly startedAt: string;
  readonly done: number;
  readonly total: number;
}

export interface ProtoAttachment {
  readonly id: string;
  readonly name: string;
  readonly kind: 'image' | 'file';
  readonly url?: string;
  readonly isMap?: boolean;
}

export interface ProtoTrip {
  readonly name: string;
  readonly startPoint: string;
}

export interface VariantProps {
  readonly trip: ProtoTrip;
  readonly stops: readonly ProtoStop[];
  readonly arrived: ReadonlySet<string>;
  readonly onToggleArrived: (stopId: string) => void;
  readonly checklists: readonly ProtoChecklist[];
  readonly runs: readonly ProtoRun[];
  readonly onStartRun: (checklistId: string) => void;
  readonly onResumeRun: (runId: string) => void;
  readonly onUndoStep: (runId: string) => void;
  readonly attachments: Readonly<Record<string, readonly ProtoAttachment[]>>;
  readonly onAddAttachment: (
    stopId: string,
    attachment: Omit<ProtoAttachment, 'id'>,
  ) => void;
}

export const MOCK_TRIP: ProtoTrip = {
  name: 'Fall Colours Loop',
  startPoint: 'Home — Newmarket, ON',
};

export const MOCK_STOPS: readonly ProtoStop[] = [
  {
    id: 'stop-1',
    campground: 'McRae Point Provincial Park',
    campsite: '214',
    arrivalDate: '2026-09-18',
    nights: 2,
    checkInTime: '14:00',
    checkOutTime: '11:00',
    bookingNumber: 'ON-4471023',
    costCents: 9450,
    address: '297 McRae Point Rd, Ramara, ON L3V 0V4',
    phone: '(705) 325-7290',
    legKm: 96,
    notes:
      'Pull-through site; dump station near the gate. Gate closes at 20:00.',
  },
  {
    id: 'stop-2',
    campground: 'Killbear Provincial Park',
    campsite: 'Beacon 78',
    arrivalDate: '2026-09-20',
    nights: 3,
    checkInTime: '14:00',
    checkOutTime: '11:00',
    bookingNumber: 'ON-4471981',
    costCents: 14_100,
    address: '35 Killbear Park Rd, Nobel, ON P0G 1G0',
    phone: '(705) 342-5492',
    legKm: 174,
    notes: 'Tight turn at the Beacon loop entrance — approach from the north.',
  },
  {
    id: 'stop-3',
    campground: 'Grundy Lake Provincial Park',
    arrivalDate: '2026-09-23',
    nights: 1,
    legKm: 88,
  },
  {
    id: 'stop-4',
    campground: 'Pinery Provincial Park',
    campsite: 'Dunes 112',
    arrivalDate: '2026-09-24',
    nights: 4,
    checkInTime: '14:00',
    bookingNumber: 'ON-4480777',
    costCents: 18_800,
    address: '9526 Lakeshore Rd, Grand Bend, ON N0M 1T0',
    phone: '(519) 243-8574',
    legKm: 342,
    notes: 'Last stop — the trip ends here. Book the oversize site next time.',
  },
];

export const MOCK_CHECKLISTS: readonly ProtoChecklist[] = [
  { id: 'cl-1', name: 'Departure & hitching', items: 12 },
  { id: 'cl-2', name: 'Campsite setup', items: 9 },
  { id: 'cl-3', name: 'Campsite teardown', items: 10 },
];

// A stand-in campground map, the kind pasted from the Ontario Parks
// reservation system. In the real build this is an S3 (Garage) object.
const MOCK_MAP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#dcead2"/><path d="M80 320 C 160 120, 480 120, 560 320" fill="none" stroke="#8a7a5c" stroke-width="24"/><circle cx="200" cy="196" r="14" fill="#f5f7fa" stroke="#1f3a5f"/><circle cx="320" cy="160" r="14" fill="#f5f7fa" stroke="#1f3a5f"/><circle cx="440" cy="196" r="14" fill="#1f3a5f"/><text x="433" y="201" font-size="12" fill="#ffffff">78</text><text x="193" y="201" font-size="12" fill="#1f3a5f">76</text><text x="313" y="165" font-size="12" fill="#1f3a5f">77</text><text x="24" y="36" font-family="sans-serif" font-size="20" fill="#1f3a5f">Beacon Loop — Killbear PP (mock map)</text></svg>`;

export const MOCK_MAP_URL = `data:image/svg+xml;utf8,${encodeURIComponent(MOCK_MAP_SVG)}`;

const MOCK_ATTACHMENTS: Readonly<Record<string, readonly ProtoAttachment[]>> = {
  'stop-1': [{ id: 'att-1', name: 'Reservation — McRae.pdf', kind: 'file' }],
  'stop-2': [
    {
      id: 'att-2',
      name: 'Campground map — Beacon Loop',
      kind: 'image',
      url: MOCK_MAP_URL,
      isMap: true,
    },
    { id: 'att-3', name: 'Reservation — Killbear.pdf', kind: 'file' },
  ],
};

export type TripStatus = 'Planned' | 'Underway' | 'Completed';

export function tripStatus(
  stops: readonly ProtoStop[],
  arrived: ReadonlySet<string>,
): TripStatus {
  if (arrived.size === 0) return 'Planned';
  if (stops.every((s) => arrived.has(s.id))) return 'Completed';
  return 'Underway';
}

export function formatKm(km: number | undefined): string {
  return km === undefined ? '— km' : `${String(km)} km`;
}

export function formatCost(cents: number | undefined): string {
  return cents === undefined ? '—' : `$${(cents / 100).toFixed(2)}`;
}

export function formatDate(iso: string | undefined): string {
  if (iso === undefined) return 'Date TBD';
  const [y, m, d] = iso.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function totalKm(stops: readonly ProtoStop[]): number {
  return stops.reduce((sum, s) => sum + (s.legKm ?? 0), 0);
}

export function loggedKm(
  stops: readonly ProtoStop[],
  arrived: ReadonlySet<string>,
): number {
  return stops
    .filter((s) => arrived.has(s.id))
    .reduce((sum, s) => sum + (s.legKm ?? 0), 0);
}

export function StatusBadge({
  status,
}: {
  readonly status: TripStatus;
}): JSX.Element {
  const styles: Record<TripStatus, string> = {
    Planned: 'bg-secondary text-secondary-foreground',
    Underway: 'bg-primary text-primary-foreground',
    Completed: 'bg-emerald-600 text-white',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

const VARIANTS = [
  { key: 'a', name: 'Itinerary timeline' },
  { key: 'b', name: 'Arrival-first dashboard' },
  { key: 'c', name: 'List + drill-in' },
] as const;

export function TripPrototypeScreen({
  rigId,
}: {
  readonly rigId: string;
}): JSX.Element {
  void rigId;
  const searchParams = useSearchParams();
  const variant = searchParams.get('variant') ?? 'a';

  // Stop 1 starts arrived so the trip opens in the Underway state.
  const [arrived, setArrived] = useState<ReadonlySet<string>>(
    new Set(['stop-1']),
  );
  const [runs, setRuns] = useState<readonly ProtoRun[]>([
    {
      id: 'run-1',
      checklistName: 'Departure & hitching',
      startedAt: 'Sep 18, 09:12',
      done: 12,
      total: 12,
    },
    {
      id: 'run-2',
      checklistName: 'Campsite setup',
      startedAt: 'Sep 18, 15:40',
      done: 7,
      total: 9,
    },
  ]);

  const onToggleArrived = (stopId: string): void => {
    setArrived((prev) => {
      const next = new Set(prev);
      if (next.has(stopId)) {
        next.delete(stopId);
      } else {
        next.add(stopId);
      }
      return next;
    });
  };

  const onStartRun = (checklistId: string): void => {
    const checklist = MOCK_CHECKLISTS.find((c) => c.id === checklistId);
    if (checklist === undefined) return;
    setRuns((prev) => [
      ...prev,
      {
        id: `run-${String(prev.length + 1)}`,
        checklistName: checklist.name,
        startedAt: 'just now',
        done: 0,
        total: checklist.items,
      },
    ]);
  };

  // Stand-ins for entering a run and ticking steps off or back on — the real
  // build reuses the existing run screen; the point here is that a run is
  // re-enterable and its progress persists.
  const onResumeRun = (runId: string): void => {
    setRuns((prev) =>
      prev.map((run) =>
        run.id === runId && run.done < run.total
          ? { ...run, done: run.done + 1 }
          : run,
      ),
    );
  };

  const [attachments, setAttachments] =
    useState<Readonly<Record<string, readonly ProtoAttachment[]>>>(
      MOCK_ATTACHMENTS,
    );

  const onAddAttachment = (
    stopId: string,
    attachment: Omit<ProtoAttachment, 'id'>,
  ): void => {
    setAttachments((prev) => ({
      ...prev,
      [stopId]: [
        ...(prev[stopId] ?? []),
        { ...attachment, id: `att-${String(Date.now())}` },
      ],
    }));
  };

  const onUndoStep = (runId: string): void => {
    setRuns((prev) =>
      prev.map((run) =>
        run.id === runId && run.done > 0 ? { ...run, done: run.done - 1 } : run,
      ),
    );
  };

  const props: VariantProps = {
    trip: MOCK_TRIP,
    stops: MOCK_STOPS,
    arrived,
    onToggleArrived,
    checklists: MOCK_CHECKLISTS,
    runs,
    onStartRun,
    onResumeRun,
    onUndoStep,
    attachments,
    onAddAttachment,
  };

  return (
    <Page>
      {variant === 'a' && <VariantA {...props} />}
      {variant === 'b' && <VariantB {...props} />}
      {variant === 'c' && <VariantC {...props} />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </Page>
  );
}
