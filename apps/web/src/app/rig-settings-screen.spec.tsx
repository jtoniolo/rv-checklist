import type { Rig } from '@rv-checklist/domain';
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
 * for adding/removing rigs.
 */

const rig: Rig = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  ownerId: '550e8400-e29b-41d4-a716-446655440001',
  nickname: 'Silver Bullet',
  make: 'Airstream',
  distanceKm: 42_000,
};

function jsonResponse(data: unknown): Response {
  return Response.json(data, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const patched: Request[] = [];

function fakeApi(request: Request): Response {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;

  if (route === 'GET /rigs') return jsonResponse([rig]);
  if (route === `PATCH /rigs/${rig.id}`) {
    patched.push(request);
    return jsonResponse(rig);
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
});
