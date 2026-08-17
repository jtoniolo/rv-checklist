import type { EquipmentItem, Rig } from '@rv-checklist/domain';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RigSettingsScreen } from './rig-settings-screen';
import { StoreProvider } from './store-provider';

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

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

/**
 * The rig settings screen (issue #62): the "Rig" nav destination. Edits the
 * active rig in place with the shared RigForm and links to the rig manager
 * for adding/removing rigs. Equipment section added in issue #79.
 */

const rig: Rig = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  ownerId: '550e8400-e29b-41d4-a716-446655440001',
  nickname: 'Silver Bullet',
  make: 'Airstream',
  distanceKm: 42_000,
};

const equipment: EquipmentItem[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440020',
    rigId: rig.id,
    name: 'Onan generator',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440021',
    rigId: rig.id,
    name: 'Solar panel',
  },
];

function jsonResponse(data: unknown): Response {
  return Response.json(data, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const patched: Request[] = [];
const postedEquipment: Request[] = [];

function fakeApi(request: Request): Response {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;

  if (route === 'GET /rigs') return jsonResponse([rig]);
  if (route === `PATCH /rigs/${rig.id}`) {
    patched.push(request);
    return jsonResponse(rig);
  }
  if (route === 'GET /equipment' && url.searchParams.get('rigId') === rig.id) {
    return jsonResponse(equipment);
  }
  if (route === 'POST /equipment') {
    postedEquipment.push(request);
    return jsonResponse({
      id: '550e8400-e29b-41d4-a716-446655440099',
      rigId: rig.id,
      name: 'New item',
    });
  }
  if (request.method === 'DELETE' && url.pathname.startsWith('/equipment/')) {
    // eslint-disable-next-line unicorn/no-null
    return new Response(null, { status: 204 });
  }
  if (request.method === 'PATCH' && url.pathname.startsWith('/equipment/')) {
    return jsonResponse({ ...equipment[0], name: 'Renamed' });
  }

  throw new Error(`Unstubbed request: ${route}${url.search}`);
}

function renderScreen(): void {
  mockPush.mockClear();
  render(
    <StoreProvider>
      <RigSettingsScreen rigId={rig.id} />
    </StoreProvider>,
  );
}

describe('RigSettingsScreen (issue #62)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    patched.length = 0;
    postedEquipment.length = 0;
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) =>
        Promise.resolve(fakeApi(input as Request)),
      );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders the edit form prefilled with the rig details', async () => {
    renderScreen();

    const form = await screen.findByRole('form', { name: 'Edit rig' });
    expect(form).toBeTruthy();
    expect(screen.getByDisplayValue('Silver Bullet')).toBeTruthy();
    expect(screen.getByDisplayValue('Airstream')).toBeTruthy();
  });

  it('saves changes with a PATCH to the rig', async () => {
    renderScreen();
    await screen.findByRole('form', { name: 'Edit rig' });

    fireEvent.change(screen.getByDisplayValue('Silver Bullet'), {
      target: { value: 'Lead Zeppelin' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(patched).toHaveLength(1);
    });
    const body = (await patched[0]?.json()) as { nickname: string };
    expect(body.nickname).toBe('Lead Zeppelin');
  });

  it('navigates to the rig home on cancel', async () => {
    renderScreen();
    await screen.findByRole('form', { name: 'Edit rig' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockPush).toHaveBeenCalledWith(`/rig/${rig.id}`);
  });

  it('says the rig was not found for a stale rig id', async () => {
    mockPush.mockClear();
    render(
      <StoreProvider>
        <RigSettingsScreen rigId="550e8400-e29b-41d4-a716-446655449999" />
      </StoreProvider>,
    );

    expect(await screen.findByText(/rig was not found/i)).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Edit rig' })).toBeNull();
  });

  it('links to the rig manager for adding or removing rigs', async () => {
    renderScreen();
    await screen.findByRole('form', { name: 'Edit rig' });

    const link = screen.getByRole('link', { name: /Manage all rigs/ });
    expect(link.getAttribute('href')).toBe('/rigs');
  });

  it('shows the equipment section with items', async () => {
    renderScreen();

    expect(await screen.findByText('Equipment')).toBeTruthy();
    expect(await screen.findByText('Onan generator')).toBeTruthy();
    expect(screen.getByText('Solar panel')).toBeTruthy();
  });

  it('has an add-equipment form', async () => {
    renderScreen();

    const form = await screen.findByRole('form', { name: 'Add equipment' });
    expect(form).toBeTruthy();
    expect(screen.getByPlaceholderText('Equipment name')).toBeTruthy();
  });
});
