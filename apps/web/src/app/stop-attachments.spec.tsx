import 'fake-indexeddb/auto';
import {
  TripReadSchema,
  tripStatus,
  type Attachment,
  type TripRead,
} from '@rv-checklist/domain';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { StopAttachments } from './stop-attachments';
import { StoreProvider } from './store-provider';
import { TripScreen } from './trip-screen';

/** Cut or restore the network the way a browser reports it (issue #153's `useIsOffline`). */
function setNetwork(isOnline: boolean): void {
  (navigator as unknown as { onLine: boolean }).onLine = isOnline;
  fireEvent(globalThis, new Event(isOnline ? 'online' : 'offline'));
}

jest.mock('next/link', () => {
  return {
    __esModule: true,
    default: ({
      href,
      children,
      ...rest
    }: {
      href: string;
      children: React.ReactNode;
      [key: string]: unknown;
    }) => (
      <a href={href} {...rest}>
        {children}
      </a>
    ),
  };
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const RIG_ID = '550e8400-e29b-41d4-a716-446655440010';
const TRIP_ID = '550e8400-e29b-41d4-a716-446655440100';

function uuid(n: number): string {
  return `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`;
}

const STOP_ID = uuid(102); // the next un-arrived stop — the hero
const STOP_B = uuid(103); // a second stop, for the paste-target test
const OLD_MAP = uuid(501); // flagged as the campground map initially
const OTHER_FILE = uuid(502); // unflagged sibling
const NEW_ATTACHMENT = uuid(503); // whatever the fake API mints on upload

function makeTrip(attachments: readonly Attachment[]): TripRead {
  const stops = [
    {
      id: STOP_ID,
      tripId: TRIP_ID,
      position: 0,
      arrived: false,
      campground: 'Killbear PP',
      attachments: [...attachments],
    },
  ];
  return TripReadSchema.parse({
    id: TRIP_ID,
    rigId: RIG_ID,
    name: 'Fall Colours Loop',
    checklistIds: [],
    stops,
    status: tripStatus(stops),
  });
}

const oldMap: Attachment = {
  id: OLD_MAP,
  stopId: STOP_ID,
  filename: 'old-map.png',
  mimeType: 'image/png',
  sizeBytes: 2048,
  isCampgroundMap: true,
};

const otherFile: Attachment = {
  id: OTHER_FILE,
  stopId: STOP_ID,
  filename: 'reservation.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 512 * 1024,
  isCampgroundMap: false,
};

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderScreen(): void {
  render(
    <StoreProvider>
      <TripScreen rigId={RIG_ID} tripId={TRIP_ID} />
    </StoreProvider>,
  );
}

/** Opens the hero's attachments disclosure and waits for the expanded body. */
async function expandAttachments(): Promise<void> {
  fireEvent.click(screen.getByText(/^Attachments/));
  await screen.findByRole('button', { name: 'Choose file' });
}

describe('Stop attachments (issue #117)', () => {
  let fetchSpy: jest.SpyInstance;
  let trip: TripRead;

  async function fakeApi(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;
    if (route === 'GET /trips' && url.searchParams.get('rigId') === RIG_ID) {
      return jsonResponse([trip]);
    }
    if (route === 'GET /checklists') {
      return jsonResponse([]);
    }
    if (route === 'GET /runs') {
      return jsonResponse([]);
    }
    const uploadMatch = /^POST \/stops\/(?<stopId>[^/]+)\/attachments$/.exec(
      route,
    );
    if (uploadMatch?.groups) {
      const stopId = uploadMatch.groups['stopId'] ?? '';
      const form = await request.clone().formData();
      const file = form.get('file') as File;
      const created: Attachment = {
        id: NEW_ATTACHMENT,
        stopId,
        filename: file.name,
        mimeType: file.type as Attachment['mimeType'],
        sizeBytes: file.size,
        isCampgroundMap: false,
      };
      // Only the hero's stop is refetched by the single-stop screen tests.
      if (stopId === STOP_ID) {
        trip = makeTrip([...(trip.stops[0]?.attachments ?? []), created]);
      }
      return jsonResponse(created, 201);
    }
    const flagMatch = /^POST \/attachments\/(?<id>[^/]+)\/campground-map$/.exec(
      route,
    );
    if (flagMatch?.groups) {
      const id = flagMatch.groups['id'];
      const { isCampgroundMap } = (await request.clone().json()) as {
        isCampgroundMap: boolean;
      };
      // The API's swap: the flag lands on the addressed attachment and comes
      // off every sibling.
      const attachments = (trip.stops[0]?.attachments ?? []).map((a) => ({
        ...a,
        isCampgroundMap: a.id === id ? isCampgroundMap : false,
      }));
      trip = makeTrip(attachments);
      const updated = attachments.find((a) => a.id === id);
      return jsonResponse(updated);
    }
    const downloadMatch = /^GET \/attachments\/(?<id>[^/]+)$/.exec(route);
    if (downloadMatch?.groups) {
      return new Response('png-bytes', {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }
    throw new Error(`Unstubbed request: ${route}${url.search}`);
  }

  beforeEach(() => {
    trip = makeTrip([]);
    // RTK Query hands the mock a Request; the inline viewer fetches by URL
    // string — normalize both to a Request.
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) =>
        fakeApi(input instanceof Request ? input : new Request(input, init)),
      );
    // jsdom has no object URLs; the inline viewer needs both ends stubbed.
    Object.assign(URL, {
      createObjectURL: jest.fn(() => 'blob:campground-map'),
      revokeObjectURL: jest.fn(),
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  /** The requests the spy saw for a method + path. */
  function sentRequests(method: string, path: string): Request[] {
    return fetchSpy.mock.calls
      .map((call: readonly unknown[]) =>
        call[0] instanceof Request
          ? call[0]
          : new Request(call[0] as string, call[1] as RequestInit),
      )
      .filter((r) => r.method === method && new URL(r.url).pathname === path);
  }

  // `fake-indexeddb/auto` backs one outbox for the whole file, with no reset
  // between tests (deleting it between tests would block on the still-open
  // connection these specs never close). A fresh stop id per test keeps one
  // test's queued capture from ever being read back by another's
  // `useOutboxEntriesForStop` (used by the offline-capture tests below).
  function renderWithFreshStop(stopId: string): void {
    trip = makeTrip([]);
    const [stop] = trip.stops;
    if (stop === undefined) throw new Error('expected a stop');
    trip = { ...trip, stops: [{ ...stop, id: stopId }] };
    renderScreen();
  }

  it('uploads a pasted file as multipart and shows the refreshed list', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Killbear PP' });

    // Collapsed by default — the section's body isn't rendered, and with
    // nothing flagged there is no campground-map link on the hero.
    expect(screen.queryByRole('button', { name: 'Choose file' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Campground map' })).toBeNull();

    await expandAttachments();
    const file = new File(['png-bytes'], 'killbear-map.png', {
      type: 'image/png',
    });
    fireEvent.paste(document, { clipboardData: { files: [file] } });

    // The refetched stop lists the new attachment with its size and actions.
    expect(await screen.findByText('killbear-map.png')).toBeTruthy();
    const [upload] = sentRequests('POST', `/stops/${STOP_ID}/attachments`);
    expect(upload).toBeTruthy();
    expect(upload?.headers.get('content-type')).toContain(
      'multipart/form-data',
    );
    const form = await upload?.clone().formData();
    const sent = form?.get('file') as File;
    expect(sent.name).toBe('killbear-map.png');
    expect(sent.type).toBe('image/png');
  });

  it('rejects an unsupported type client-side, before any request', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Killbear PP' });
    await expandAttachments();

    const file = new File(['plain'], 'notes.txt', { type: 'text/plain' });
    fireEvent.paste(document, { clipboardData: { files: [file] } });

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('notes.txt'),
    );
    expect(sentRequests('POST', `/stops/${STOP_ID}/attachments`)).toHaveLength(
      0,
    );
  });

  it('swaps the campground-map flag and retargets the hero link', async () => {
    trip = makeTrip([oldMap, otherFile]);
    renderScreen();
    await screen.findByRole('heading', { name: 'Killbear PP' });
    await expandAttachments();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Campground map flag — reservation.pdf',
      }),
    );

    // The refetched stop carries the swap: the flag moved off the old map.
    await waitFor(() => {
      expect(
        screen
          .getByRole('button', {
            name: 'Campground map flag — reservation.pdf',
          })
          .getAttribute('aria-pressed'),
      ).toBe('true');
    });
    expect(
      screen
        .getByRole('button', { name: 'Campground map flag — old-map.png' })
        .getAttribute('aria-pressed'),
    ).toBe('false');

    const [flag] = sentRequests(
      'POST',
      `/attachments/${OTHER_FILE}/campground-map`,
    );
    expect(await flag?.clone().json()).toEqual({ isCampgroundMap: true });

    // The hero's first-class link now opens the newly flagged attachment
    // inline (fetched with credentials, rendered from a blob URL).
    fireEvent.click(screen.getByRole('button', { name: 'Campground map' }));
    const viewer = await screen.findByLabelText('Campground map');
    await waitFor(() => {
      expect(within(viewer).getByTitle('reservation.pdf')).toBeTruthy();
    });
    expect(sentRequests('GET', `/attachments/${OTHER_FILE}`)).toHaveLength(1);
    expect(sentRequests('GET', `/attachments/${OLD_MAP}`)).toHaveLength(0);
  });

  it('opens a "View" click through a fetch, not a raw navigation (issue #151)', async () => {
    // A plain `<a target="_blank">` to a cross-origin url is never routed
    // through this origin's service worker, so it can never be served from
    // the warmed or LRU caches offline — only an in-page fetch can be.
    trip = makeTrip([otherFile]);
    const openSpy = jest
      .spyOn(globalThis, 'open')
      .mockReturnValue({ location: { href: '' } } as unknown as Window);
    renderScreen();
    await screen.findByRole('heading', { name: 'Killbear PP' });
    await expandAttachments();

    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    await waitFor(() => {
      expect(sentRequests('GET', `/attachments/${OTHER_FILE}`)).toHaveLength(1);
    });
    openSpy.mockRestore();
  });

  it('disables "View" offline for an attachment with no cached bytes, no error dialog', async () => {
    trip = makeTrip([otherFile]);
    const matchSpy = jest.fn().mockResolvedValue(undefined);
    Object.assign(globalThis, { caches: { match: matchSpy } });
    Object.defineProperty(navigator, 'onLine', { value: false });

    renderScreen();
    await screen.findByRole('heading', { name: 'Killbear PP' });
    await expandAttachments();

    expect(await screen.findByText('View (available online)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'View' })).toBeNull();

    Object.defineProperty(navigator, 'onLine', { value: true });
    Reflect.deleteProperty(globalThis, 'caches');
  });

  it('routes a paste to exactly one stop — the section opened last', async () => {
    // The trip editor mounts a manager per stop with independent
    // disclosures; with two sections open, one Ctrl+V must reach exactly
    // one stop (the paste-target stack — the regression from review).
    const stops = [
      {
        id: STOP_ID,
        tripId: TRIP_ID,
        position: 0,
        arrived: false,
        campground: 'Killbear PP',
        attachments: [],
      },
      {
        id: STOP_B,
        tripId: TRIP_ID,
        position: 1,
        arrived: false,
        campground: 'Bon Echo PP',
        attachments: [],
      },
    ];
    const twoStops = TripReadSchema.parse({
      id: TRIP_ID,
      rigId: RIG_ID,
      name: 'Fall Colours Loop',
      checklistIds: [],
      stops,
      status: tripStatus(stops),
    }).stops;
    const [first, second] = twoStops;
    if (first === undefined || second === undefined) {
      throw new Error('expected two stops');
    }
    render(
      <StoreProvider>
        <StopAttachments stop={first} tripId={TRIP_ID} rigId={RIG_ID} />
        <StopAttachments stop={second} tripId={TRIP_ID} rigId={RIG_ID} />
      </StoreProvider>,
    );

    // Open both sections, the first stop's then the second's.
    for (const summary of screen.getAllByText(/^Attachments/)) {
      fireEvent.click(summary);
    }
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: 'Choose file' }),
      ).toHaveLength(2);
    });

    const file = new File(['png-bytes'], 'site-map.png', {
      type: 'image/png',
    });
    fireEvent.paste(document, { clipboardData: { files: [file] } });

    // Exactly one upload — to the last-opened section's stop.
    await waitFor(() => {
      expect(sentRequests('POST', `/stops/${STOP_B}/attachments`)).toHaveLength(
        1,
      );
    });
    expect(sentRequests('POST', `/stops/${STOP_ID}/attachments`)).toHaveLength(
      0,
    );

    // Closing the last-opened section hands the paste target back to the
    // still-open one. The details toggle event is asynchronous, so wait for
    // the closed section's body to unmount before pasting again.
    const [, secondSummary] = screen.getAllByText(/^Attachments/);
    if (secondSummary === undefined) {
      throw new Error('expected two summaries');
    }
    fireEvent.click(secondSummary);
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: 'Choose file' }),
      ).toHaveLength(1);
    });
    fireEvent.paste(document, { clipboardData: { files: [file] } });
    await waitFor(() => {
      expect(
        sentRequests('POST', `/stops/${STOP_ID}/attachments`),
      ).toHaveLength(1);
    });
    expect(sentRequests('POST', `/stops/${STOP_B}/attachments`)).toHaveLength(
      1,
    );
  });

  describe('offline capture (issue #152)', () => {
    afterEach(() => {
      setNetwork(true);
    });

    it('queues an offline capture instead of uploading, with a "waiting to upload" badge', async () => {
      const stopId = uuid(900);
      renderWithFreshStop(stopId);
      await screen.findByRole('heading', { name: 'Killbear PP' });
      await expandAttachments();
      setNetwork(false);

      const file = new File(['png-bytes'], 'killbear-map.png', {
        type: 'image/png',
      });
      fireEvent.paste(document, { clipboardData: { files: [file] } });

      expect(await screen.findByText('killbear-map.png')).toBeTruthy();
      expect(screen.getByText(/waiting to upload/i)).toBeTruthy();
      // Never hit the network — no server row exists for a pending capture.
      expect(sentRequests('POST', `/stops/${stopId}/attachments`)).toHaveLength(
        0,
      );
    });

    it('discards a pending capture with no server call', async () => {
      const stopId = uuid(901);
      renderWithFreshStop(stopId);
      await screen.findByRole('heading', { name: 'Killbear PP' });
      await expandAttachments();
      setNetwork(false);

      const file = new File(['png-bytes'], 'killbear-map.png', {
        type: 'image/png',
      });
      fireEvent.paste(document, { clipboardData: { files: [file] } });
      await screen.findByText('killbear-map.png');

      fireEvent.click(
        screen.getByRole('button', { name: /discard.*killbear-map\.png/i }),
      );

      await waitFor(() => {
        expect(screen.queryByText('killbear-map.png')).toBeNull();
      });
      expect(sentRequests('POST', `/stops/${stopId}/attachments`)).toHaveLength(
        0,
      );
    });
  });
});
